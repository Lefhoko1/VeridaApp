// Rules that must hold for every object in every module, including ones added later.
// A new table or function that breaks them fails here without needing its own test.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { asUser, createDatabase, createUser } from './harness.mjs';

const MODULE_SCHEMAS = [
  'identity', 'authz', 'audit', 'platform', 'business', 'records',
  'operations', 'analytics', 'learning', 'assistant', 'notifications', 'plan',
];

describe('schema invariants', () => {
  let db;
  before(async () => {
    db = await createDatabase();
  });

  test('every table has row-level security enabled', async () => {
    const { rows } = await db.query(
      `select n.nspname || '.' || c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname = any($1) and not c.relrowsecurity`,
      [MODULE_SCHEMAS],
    );
    assert.deepEqual(rows, []);
  });

  test('every table with RLS has at least one policy, or is reachable by no client', async () => {
    const { rows } = await db.query(
      `select n.nspname || '.' || c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r' and n.nspname = any($1)
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
          and has_table_privilege('authenticated', c.oid, 'select')`,
      [MODULE_SCHEMAS],
    );
    assert.deepEqual(rows, []);
  });

  test('no function is executable by PUBLIC', async () => {
    const { rows } = await db.query(
      `select n.nspname || '.' || p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = any($1)
          and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')`,
      [MODULE_SCHEMAS],
    );
    assert.deepEqual(rows, []);
  });

  test('every security definer function pins its search_path', async () => {
    const { rows } = await db.query(
      `select n.nspname || '.' || p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = any($1) and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
      [MODULE_SCHEMAS],
    );
    assert.deepEqual(rows, []);
  });

  test('the anon role has no access to any module schema', async () => {
    const { rows } = await db.query(
      `select s from unnest($1::text[]) s where has_schema_privilege('anon', s, 'usage')`,
      [MODULE_SCHEMAS],
    );
    assert.deepEqual(rows, []);
  });

  test('every administrative function asks for a specific permission', async () => {
    const { rows } = await db.query(
      `select n.nspname || '.' || p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = any($1) and p.proname like 'admin\\_%'
          and p.prosrc not like '%authz.require_platform_permission(%'`,
      [MODULE_SCHEMAS],
    );
    assert.deepEqual(rows, []);
  });

  test('no function still checks for the whole administrator role in place of a permission', async () => {
    const { rows } = await db.query(
      `select n.nspname || '.' || p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = any($1) and p.prosrc like '%require_platform_role(''administrator'')%'`,
      [MODULE_SCHEMAS],
    );
    assert.deepEqual(rows, []);
  });

  test('internal functions cannot be called by a signed-in client', async () => {
    const user = await createUser(db);
    for (const call of [
      `select notifications.deliver('${user.id}', 'account', 't', 'b')`,
      `select notifications.tell_staff('audit.view', 't', 'b')`,
      `select audit.enable_tracking('records.products')`,
      `select authz.platform_permission_for('${user.id}', 'audit.view')`,
      `select authz.staff_with_permission('audit.view')`,
      `select business.apply_member_permission('${user.id}', '${user.id}', 'audit.view', true)`,
      `select business.move_ownership('${user.id}', '${user.id}')`,
      `select * from business.permissions_of('${user.id}', '${user.id}')`,
      `select identity.assert_can_leave('${user.id}')`,
      `select platform.deletion_grace_days()`,
    ]) {
      await assert.rejects(asUser(db, user.id, (tx) => tx.query(call)), /permission denied/, call);
    }
  });
});
