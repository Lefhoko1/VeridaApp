// A small stand-in for Supabase: enough of the Auth and PostgREST HTTP APIs for the real
// supabase-js client to talk to the real migrations (on PGlite), with RLS and roles enforced.
// It lets integration tests and local development run without Docker. It approximates
// Supabase and does not replace testing against a real project. In-memory: data is lost on exit.
//
//   node tests/integration/emulator.mjs [--port 54321] [--demo]
//
// --demo adds an account with sample businesses, which also has the reviewer and admin roles.
// Every emailed verification code is 123456.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

import { createDatabase } from '../database/harness.mjs';

const EXPOSED_SCHEMAS = ['identity', 'authz', 'platform', 'business', 'records', 'operations', 'analytics', 'learning', 'assistant', 'notifications'];
export const VERIFICATION_CODE = '123456';
// Stands in for the secret key that Edge Functions receive.
export const SERVICE_KEY = 'emulator-service-key';
const DEMO_ACCOUNT = { email: 'demo@verida.test', password: 'Verida2026' };

const quoteLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw httpError(400, 'PGRST100', `Invalid identifier: ${name}`);
  return `"${name}"`;
}

function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

const STATUS_BY_SQLSTATE = { 42501: 403, 23505: 409, 23503: 409, 23001: 409, 23514: 400, 22023: 400, P0001: 400, P0002: 404 };

function encodeToken(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.emulator`;
}

function subjectOf(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).sub ?? null;
  } catch {
    return null;
  }
}

// --- PostgREST query parameters -----------------------------------------------------------

function conditionFor(column, expression) {
  const dot = expression.indexOf('.');
  const operator = expression.slice(0, dot);
  const operand = expression.slice(dot + 1);
  const col = quoteIdent(column);
  switch (operator) {
    case 'eq':
      return `${col} = ${quoteLiteral(operand)}`;
    case 'neq':
      return `${col} <> ${quoteLiteral(operand)}`;
    case 'gte':
      return `${col} >= ${quoteLiteral(operand)}`;
    case 'lte':
      return `${col} <= ${quoteLiteral(operand)}`;
    case 'ilike':
      return `${col} ilike ${quoteLiteral(operand.replace(/\*/g, '%'))}`;
    // PostgREST lists values as in.(a,b), quoting only those that need it.
    case 'in': {
      const values = operand.slice(1, -1).split(',').map((value) => value.replace(/^"|"$/g, ''));
      return `${col} in (${values.map(quoteLiteral).join(', ')})`;
    }
    case 'is':
      if (!['null', 'true', 'false'].includes(operand)) throw httpError(400, 'PGRST100', `Bad is: ${operand}`);
      return `${col} is ${operand}`;
    default:
      throw httpError(400, 'PGRST100', `Unsupported operator: ${operator}`);
  }
}

function whereClause(params) {
  const conditions = [];
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    if (key === 'or') {
      const parts = value.replace(/^\(|\)$/g, '').split(',');
      conditions.push(
        `(${parts
          .map((part) => {
            const dot = part.indexOf('.');
            return conditionFor(part.slice(0, dot), part.slice(dot + 1));
          })
          .join(' or ')})`,
      );
    } else {
      conditions.push(conditionFor(key, value));
    }
  }
  return conditions.length ? ` where ${conditions.join(' and ')}` : '';
}

function orderClause(params) {
  const order = params.get('order');
  if (!order) return '';
  const terms = order.split(',').map((term) => {
    const [column, ...modifiers] = term.split('.');
    const sql = { asc: 'asc', desc: 'desc', nullsfirst: 'nulls first', nullslast: 'nulls last' };
    return `${quoteIdent(column)} ${modifiers.map((m) => sql[m] ?? '').join(' ')}`;
  });
  return ` order by ${terms.join(', ')}`;
}

function selectList(params) {
  const select = params.get('select');
  if (!select || select === '*') return '*';
  return select.split(',').map((column) => quoteIdent(column.trim())).join(', ');
}

function wantsObject(req) {
  return (req.headers.accept ?? '').includes('vnd.pgrst.object');
}

function respondRows(rows, req) {
  if (!wantsObject(req)) return { status: 200, body: rows };
  if (rows.length !== 1) throw httpError(406, 'PGRST116', `JSON object requested, multiple (or no) rows returned: ${rows.length}`);
  return { status: 200, body: rows[0] };
}

// --- REST ---------------------------------------------------------------------------------

async function handleTable(tx, { schema, name, params, req, body }) {
  const table = `${quoteIdent(schema)}.${quoteIdent(name)}`;
  const prefer = req.headers.prefer ?? '';
  const returning = prefer.includes('return=representation');
  const wrap = async (sql) => {
    if (!returning) {
      await tx.exec(sql);
      return { status: 201, body: null };
    }
    const { rows } = await tx.query(
      `with changed as (${sql} returning ${selectList(params)}) select coalesce(jsonb_agg(changed), '[]'::jsonb) as data from changed`,
    );
    return respondRows(rows[0].data, req);
  };

  switch (req.method) {
    case 'GET': {
      const limit = params.get('limit') ? ` limit ${Number(params.get('limit'))}` : '';
      const { rows } = await tx.query(
        `select coalesce(jsonb_agg(t), '[]'::jsonb) as data
           from (select ${selectList(params)} from ${table}${whereClause(params)}${orderClause(params)}${limit}) t`,
      );
      return respondRows(rows[0].data, req);
    }
    case 'POST': {
      const records = Array.isArray(body) ? body : [body];
      const columns = Object.keys(records[0]).map(quoteIdent);
      const list = columns.join(', ');
      const json = quoteLiteral(JSON.stringify(records));
      let sql = `insert into ${table} (${list}) select ${list} from jsonb_populate_recordset(null::${table}, ${json}::jsonb)`;
      if (prefer.includes('resolution=merge-duplicates')) {
        const { rows } = await tx.query(
          `select a.attname from pg_index i
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
            where i.indrelid = ${quoteLiteral(table)}::regclass and i.indisprimary`,
        );
        const keys = rows.map((row) => row.attname);
        // Like PostgREST, this sets the conflict columns too, which matters for column grants.
        const updates = Object.keys(records[0]).map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`);
        sql += ` on conflict (${keys.map(quoteIdent).join(', ')}) do update set ${updates.join(', ')}`;
      }
      return wrap(sql);
    }
    case 'PATCH': {
      const json = quoteLiteral(JSON.stringify(body));
      const assignments = Object.keys(body)
        .map((c) => `${quoteIdent(c)} = (select ${quoteIdent(c)} from jsonb_populate_record(null::${table}, ${json}::jsonb))`)
        .join(', ');
      return wrap(`update ${table} set ${assignments}${whereClause(params)}`);
    }
    case 'DELETE':
      return wrap(`delete from ${table}${whereClause(params)}`);
    default:
      throw httpError(405, 'PGRST100', `Unsupported method ${req.method}`);
  }
}

function argumentLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // PostgREST turns a JSON array into a Postgres array when the parameter is one.
  if (Array.isArray(value)) return quoteLiteral(`{${value.map((item) => JSON.stringify(String(item))).join(',')}}`);
  if (typeof value === 'object') return quoteLiteral(JSON.stringify(value));
  return quoteLiteral(value);
}

async function handleRpc(tx, { schema, name, req, body }) {
  // Shape information is read as the migration role's catalog view, like PostgREST's schema cache.
  const { rows } = await tx.query(
    `select p.proretset, t.typname, t.typtype
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
      where n.nspname = $1 and p.proname = $2`,
    [schema, name],
  );
  if (rows.length === 0) throw httpError(404, 'PGRST202', `Could not find the function ${schema}.${name}`);
  const { proretset, typname, typtype } = rows[0];

  const args = Object.entries(body ?? {})
    .map(([key, value]) => `${quoteIdent(key)} => ${argumentLiteral(value)}`)
    .join(', ');
  const call = `${quoteIdent(schema)}.${quoteIdent(name)}(${args})`;

  if (typname === 'void') {
    await tx.exec(`select ${call}`);
    return { status: 204, body: null };
  }
  if (proretset && (typtype === 'c' || typname === 'record')) {
    const result = await tx.query(`select coalesce(jsonb_agg(t), '[]'::jsonb) as data from ${call} t`);
    return respondRows(result.rows[0].data, req);
  }
  if (proretset) {
    const result = await tx.query(`select coalesce(jsonb_agg(t.v), '[]'::jsonb) as data from ${call} as t(v)`);
    return { status: 200, body: result.rows[0].data };
  }
  const result = await tx.query(`select to_jsonb(t) as data from ${call} t`);
  return { status: 200, body: result.rows[0].data };
}

function handleRest(db, req, url, body) {
  const path = url.pathname.replace('/rest/v1/', '');
  const isRpc = path.startsWith('rpc/');
  const name = isRpc ? path.slice(4) : path;
  const schema = req.headers[req.method === 'GET' ? 'accept-profile' : 'content-profile'] ?? 'public';
  if (!EXPOSED_SCHEMAS.includes(schema)) {
    throw httpError(406, 'PGRST106', `The schema must be one of the following: ${EXPOSED_SCHEMAS.join(', ')}`);
  }
  const subject = subjectOf(req);
  const isService = (req.headers.authorization ?? '') === `Bearer ${SERVICE_KEY}`;
  return db.transaction(async (tx) => {
    if (subject) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [subject]);
    await tx.exec(`set local role ${isService ? 'service_role' : subject ? 'authenticated' : 'anon'}`);
    const context = { schema, name, params: url.searchParams, req, body };
    return isRpc ? handleRpc(tx, context) : handleTable(tx, context);
  });
}

// --- Auth ---------------------------------------------------------------------------------

function createAuth(db) {
  const passwords = new Map();
  const pendingEmails = new Map();

  const authError = (status, code, message) => Object.assign(new Error(message), { status, authCode: code });

  const toUser = (row) => ({
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    app_metadata: {},
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [{}],
    created_at: new Date().toISOString(),
  });

  const session = (row) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    return {
      access_token: encodeToken({ sub: row.id, email: row.email, role: 'authenticated', aud: 'authenticated', exp: expiresAt }),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: expiresAt,
      refresh_token: `refresh-${row.id}`,
      user: toUser(row),
    };
  };

  const findByEmail = async (email) => (await db.query('select * from auth.users where lower(email) = lower($1)', [email])).rows[0];
  const findById = async (id) => (await db.query('select * from auth.users where id = $1', [id])).rows[0];

  return async function handleAuth(req, url, body) {
    const path = url.pathname.replace('/auth/v1/', '');
    switch (`${req.method} ${path}`) {
      case 'POST signup': {
        const existing = await findByEmail(body.email);
        // Like Supabase with confirmations on: existing accounts are not revealed outright.
        if (existing) return { status: 200, body: { ...toUser(existing), identities: [] } };
        const id = randomUUID();
        await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, body.email, JSON.stringify(body.data ?? {})]);
        passwords.set(id, body.password);
        return { status: 200, body: toUser(await findById(id)) };
      }
      case 'POST verify': {
        if (body.token !== VERIFICATION_CODE) throw authError(403, 'otp_expired', 'Token has expired or is invalid');
        if (body.type === 'email_change') {
          const owner = [...pendingEmails.entries()].find(([, email]) => email === body.email);
          if (!owner) throw authError(403, 'otp_expired', 'Token has expired or is invalid');
          await db.query('update auth.users set email = $2 where id = $1', [owner[0], body.email]);
          pendingEmails.delete(owner[0]);
          return { status: 200, body: session(await findById(owner[0])) };
        }
        const user = await findByEmail(body.email);
        if (!user) throw authError(403, 'otp_expired', 'Token has expired or is invalid');
        await db.query('update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [user.id]);
        return { status: 200, body: session(await findById(user.id)) };
      }
      case 'POST token': {
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          const user = await findById(body.refresh_token.replace('refresh-', ''));
          if (!user) throw authError(400, 'refresh_token_not_found', 'Invalid refresh token');
          return { status: 200, body: session(user) };
        }
        const user = await findByEmail(body.email);
        if (!user || passwords.get(user.id) !== body.password) throw authError(400, 'invalid_credentials', 'Invalid login credentials');
        if (!user.email_confirmed_at) throw authError(400, 'email_not_confirmed', 'Email not confirmed');
        return { status: 200, body: session(user) };
      }
      case 'GET user':
      case 'PUT user': {
        const id = subjectOf(req);
        if (!id) throw authError(401, 'no_authorization', 'Not signed in');
        if (req.method === 'PUT') {
          if (body.password) {
            if (body.password === passwords.get(id)) throw authError(422, 'same_password', 'New password must be different');
            passwords.set(id, body.password);
          }
          if (body.email) pendingEmails.set(id, body.email);
        }
        return { status: 200, body: toUser(await findById(id)) };
      }
      case 'POST logout':
        return { status: 204, body: null };
      case 'POST recover':
      case 'POST resend':
        return { status: 200, body: {} };
      default:
        throw authError(404, 'not_found', `Unsupported auth route: ${path}`);
    }
  };
}

// --- Server -------------------------------------------------------------------------------

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : undefined;
}

export async function startEmulator({ port = 0, demo = false } = {}) {
  const db = await createDatabase();
  const handleAuth = createAuth(db);

  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', ...CORS });
      res.end(body === null || body === undefined ? undefined : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204);

    const url = new URL(req.url, 'http://localhost');
    try {
      const body = await readJson(req);
      if (url.pathname.startsWith('/auth/v1/')) {
        const result = await handleAuth(req, url, body);
        return send(result.status, result.body);
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const result = await handleRest(db, req, url, body);
        return send(result.status, result.body);
      }
      // Test and development helper, in place of assigning roles in the dashboard.
      if (url.pathname === '/__emulator/grant-role') {
        const { rows } = await db.query('select id from auth.users where lower(email) = lower($1)', [body.email]);
        await db.query('insert into authz.platform_role_assignments (user_id, role) values ($1, $2)', [rows[0].id, body.role]);
        return send(204);
      }
      return send(404, { message: 'Not found' });
    } catch (error) {
      if (error.authCode) return send(error.status, { error_code: error.authCode, msg: error.message, code: error.status });
      const status = error.status ?? STATUS_BY_SQLSTATE[error.code] ?? 500;
      if (status === 500) console.error(`[emulator] ${req.method} ${req.url}:`, error);
      return send(status, { code: error.code ?? 'XX000', message: error.message, details: null, hint: null });
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  if (demo) await loadDemoAccount(db, url);
  return { url, stop: () => new Promise((resolve) => server.close(resolve)) };
}

// Signs up through the API like a real user, then runs the same demo script as a real project.
async function loadDemoAccount(db, url) {
  const post = (path, body) => fetch(`${url}/auth/v1/${path}`, { method: 'POST', body: JSON.stringify(body) });
  await post('signup', { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password, data: { full_name: 'Demo Owner' } });
  await post('verify', { type: 'signup', email: DEMO_ACCOUNT.email, token: VERIFICATION_CODE });
  await db.exec(readFileSync(new URL('../../supabase/dev/load_demo_data.sql', import.meta.url), 'utf8'));
  // Also staff, so one account can see the owner, reviewer and administrator sides of the app.
  await db.query(
    `insert into authz.platform_role_assignments (user_id, role)
     select u.id, r from auth.users u cross join unnest(array['learning_reviewer', 'administrator']) r where u.email = $1`,
    [DEMO_ACCOUNT.email],
  );
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('emulator.mjs')) {
  const portFlag = process.argv.indexOf('--port');
  const port = portFlag > -1 ? Number(process.argv[portFlag + 1]) : 54321;
  const demo = process.argv.includes('--demo');
  const { url } = await startEmulator({ port, demo });
  console.log(`READY ${url}`);
  if (demo) console.log(`Demo account: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`);
}
