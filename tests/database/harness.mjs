// Runs the real migrations on PGlite (Postgres compiled to WASM), with the small part of
// Supabase they rely on stubbed: the auth schema and the client roles.
import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    email text not null,
    email_confirmed_at timestamptz,
    last_sign_in_at timestamptz,
    raw_user_meta_data jsonb not null default '{}',
    encrypted_password text,
    phone text,
    email_change text default '',
    recovery_token text default '',
    confirmation_token text default '',
    banned_until timestamptz
  );
  create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null);
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createDatabase() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  return db;
}

// Creates a verified user through auth.users, as Supabase Auth would.
export async function createUser(db, { name = 'Test User', confirmed = true } = {}) {
  const id = randomUUID();
  const email = `${id}@verida.test`;
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, $3, jsonb_build_object('full_name', $4::text))`,
    [id, email, confirmed ? new Date().toISOString() : null, name],
  );
  return { id, email };
}

export async function grantPlatformRole(db, userId, role) {
  await db.query('insert into authz.platform_role_assignments (user_id, role) values ($1, $2)', [userId, role]);
}

// Runs fn as an authenticated client, so RLS, column grants and auth.uid() all apply.
export function asUser(db, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec('set local role authenticated');
    return fn(tx);
  });
}

export function asAnon(db, fn) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    return fn(tx);
  });
}

export async function registerBusiness(db, ownerId, { name = 'Biz', industry = 'poultry' } = {}) {
  return asUser(db, ownerId, async (tx) => {
    const { rows } = await tx.query(
      `select * from business.register_business($1, $2, 'Already operating', 'Small-scale', 'Botswana',
         'Gaborone', 'BWP', 'Understand performance', 'Mostly manual records')`,
      [name, industry],
    );
    return rows[0];
  });
}

export async function addMember(db, ownerId, memberUser, businessId, role) {
  const invitation = await asUser(db, ownerId, async (tx) => {
    const { rows } = await tx.query('select * from business.invite_member($1, $2, $3)', [
      businessId,
      memberUser.email,
      role,
    ]);
    return rows[0];
  });
  await asUser(db, memberUser.id, (tx) =>
    tx.query('select business.respond_to_invitation($1, true)', [invitation.id]),
  );
}

export async function activityTypeId(db, industry, code) {
  const { rows } = await db.query(
    'select id from platform.activity_types where industry_code = $1 and code = $2',
    [industry, code],
  );
  return rows[0].id;
}

export async function recordActivity(tx, businessId, typeId, occurredOn, quantity, { unit = 'x', flockId = null } = {}) {
  await tx.query(
    `insert into operations.activity_records (business_id, activity_type_id, occurred_on, quantity, unit, flock_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [businessId, typeId, occurredOn, quantity, unit, flockId],
  );
}

export async function kpis(db, userId, businessId, from, to) {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query('select * from analytics.compute_kpis($1, $2, $3)', [businessId, from, to]);
    return Object.fromEntries(
      rows.map((r) => [r.code, { value: r.value === null ? null : Number(r.value), status: r.status, note: r.note }]),
    );
  });
}
