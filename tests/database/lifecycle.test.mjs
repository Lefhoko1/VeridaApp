// FR-A20, A21, A27, B13, B22, F35, H05, I07, I10, I12 and section 5: ownership rules, personal
// permissions on both sides of the platform, erasure, lesson activities and staff notifications.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { activityTypeId, addMember, asUser, createDatabase, createUser, grantPlatformRole, recordActivity, registerBusiness } from './harness.mjs';

const NOT_PERMITTED = /do not have permission/;

const inbox = async (db, userId, title) =>
  (await asUser(db, userId, (tx) => tx.query('select title, body from notifications.notifications where title = $1', [title]))).rows;

describe('leaving Verida (FR-A20, FR-A21, FR-A27)', () => {
  let db, admin;

  before(async () => {
    db = await createDatabase();
    admin = await createUser(db, { name: 'Admin' });
    await grantPlatformRole(db, admin.id, 'administrator');
  });

  test('an owner cannot deactivate or request deletion while their business is running', async () => {
    const owner = await createUser(db);
    const biz = await registerBusiness(db, owner.id, { name: 'Vinabbie' });
    for (const call of ['select identity.deactivate_account()', 'select identity.request_account_deletion()']) {
      await assert.rejects(asUser(db, owner.id, (tx) => tx.query(call)), /still owns Vinabbie/, call);
    }
    await assert.rejects(asUser(db, admin.id, (tx) => tx.query('select identity.admin_initiate_deletion($1)', [owner.id])), /still owns Vinabbie/);

    await asUser(db, owner.id, (tx) => tx.query(`select business.set_business_status($1, 'deactivated')`, [biz.id]));
    await asUser(db, owner.id, (tx) => tx.query('select identity.deactivate_account()'));
    const { rows } = await db.query('select account_status from identity.profiles where id = $1', [owner.id]);
    assert.equal(rows[0].account_status, 'deactivated');
  });

  test('someone who owns nothing can leave', async () => {
    const user = await createUser(db);
    await asUser(db, user.id, (tx) => tx.query('select identity.request_account_deletion()'));
    const { rows } = await db.query('select account_status, deletion_requested_at from identity.profiles where id = $1', [user.id]);
    assert.equal(rows[0].account_status, 'deletion_requested');
    assert.ok(rows[0].deletion_requested_at);
  });

  test('a suspended account cannot replace its suspension with a deletion request', async () => {
    const user = await createUser(db);
    await asUser(db, admin.id, (tx) => tx.query(`select identity.admin_set_user_status($1, 'suspended')`, [user.id]));
    await assert.rejects(asUser(db, user.id, (tx) => tx.query('select identity.request_account_deletion()')), /cannot request deletion/);
    const { rows } = await db.query('select account_status from identity.profiles where id = $1', [user.id]);
    assert.equal(rows[0].account_status, 'suspended');
  });

  test('the only active administrator cannot leave, and a suspended one does not count', async () => {
    const fresh = await createDatabase();
    const only = await createUser(fresh);
    const suspended = await createUser(fresh);
    await grantPlatformRole(fresh, only.id, 'administrator');
    await grantPlatformRole(fresh, suspended.id, 'administrator');
    await asUser(fresh, only.id, (tx) => tx.query(`select identity.admin_set_user_status($1, 'suspended')`, [suspended.id]));
    await assert.rejects(asUser(fresh, only.id, (tx) => tx.query('select identity.deactivate_account()')), /only Verida administrator/);
    await assert.rejects(asUser(fresh, only.id, (tx) => tx.query(`select authz.admin_revoke_platform_role($1, 'administrator')`, [only.id])), /at least one administrator/);
  });
});

describe('a member\'s own permissions (FR-B22, FR-B26)', () => {
  let db, owner, staff, biz;

  const sale = (tx) =>
    tx.query(`insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
              values ($1, '2026-10-01', 'Eggs', 'Egg sales', 1, 2) returning id`, [biz.id]);
  const setPermission = (actor, target, permission, allowed) =>
    asUser(db, actor, (tx) => tx.query('select business.set_member_permission($1, $2, $3, $4)', [biz.id, target, permission, allowed]));
  const mine = async (userId) =>
    (await asUser(db, userId, (tx) => tx.query('select authz.my_business_permissions($1) as code', [biz.id]))).rows.map((r) => r.code);

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
    staff = await createUser(db);
    biz = await registerBusiness(db, owner.id);
    await addMember(db, owner.id, staff, biz.id, 'staff');
  });

  test('an owner can give one member a permission their role lacks, and the database honours it', async () => {
    const created = await asUser(db, staff.id, sale);
    await assert.rejects(asUser(db, staff.id, (tx) => tx.query(`select records.void_sale($1, 'x')`, [created.rows[0].id])), NOT_PERMITTED);

    await setPermission(owner.id, staff.id, 'records.void', true);
    assert.ok((await mine(staff.id)).includes('records.void'));
    await asUser(db, staff.id, (tx) => tx.query(`select records.void_sale($1, 'Mistake')`, [created.rows[0].id]));
    assert.equal((await inbox(db, staff.id, 'Your permissions changed')).length, 1);
  });

  test('an owner can take one permission away, and row-level security follows', async () => {
    await setPermission(owner.id, staff.id, 'records.view', false);
    assert.ok(!(await mine(staff.id)).includes('records.view'));
    const { rows } = await asUser(db, staff.id, (tx) => tx.query('select id from records.sales_transactions'));
    assert.equal(rows.length, 0);
  });

  test('clearing an override returns the member to their role', async () => {
    await setPermission(owner.id, staff.id, 'records.view', null);
    assert.ok((await mine(staff.id)).includes('records.view'));
    const { rows } = await asUser(db, owner.id, (tx) => tx.query('select * from business.member_permissions($1, $2)', [biz.id, staff.id]));
    const view = rows.find((row) => row.permission === 'records.view');
    assert.deepEqual([view.from_role, view.override, view.allowed], [true, null, true]);
  });

  test('a role change clears personal permissions and says so once', async () => {
    await setPermission(owner.id, staff.id, 'audit.view', true);
    await asUser(db, owner.id, (tx) => tx.query(`select business.change_member_role($1, $2, 'viewer')`, [biz.id, staff.id]));
    assert.ok(!(await mine(staff.id)).includes('audit.view'));
    assert.equal((await inbox(db, staff.id, 'Your role changed')).length, 1);
    await asUser(db, owner.id, (tx) => tx.query(`select business.change_member_role($1, $2, 'staff')`, [biz.id, staff.id]));
  });

  test('nobody can raise their own access, or give what they do not hold', async () => {
    await setPermission(owner.id, staff.id, 'members.manage', true);
    await assert.rejects(setPermission(staff.id, staff.id, 'business.manage', true), /your own permissions/);
    await assert.rejects(asUser(db, staff.id, (tx) => tx.query(`select business.change_member_role($1, $2, 'manager')`, [biz.id, staff.id])), /your own role/);

    const colleague = await createUser(db);
    await addMember(db, owner.id, colleague, biz.id, 'viewer');
    await assert.rejects(setPermission(staff.id, colleague.id, 'business.manage', true), /permissions you hold yourself/);
    await setPermission(owner.id, staff.id, 'members.manage', null);
  });

  test('an owner\'s permissions cannot be changed, and an outsider cannot change anyone\'s', async () => {
    const manager = await createUser(db);
    await addMember(db, owner.id, manager, biz.id, 'manager');
    await setPermission(owner.id, manager.id, 'members.manage', true);
    await assert.rejects(setPermission(manager.id, owner.id, 'records.view', false), /always has every permission/);
    const outsider = await createUser(db);
    await assert.rejects(setPermission(outsider.id, staff.id, 'records.void', true), NOT_PERMITTED);
    await assert.rejects(asUser(db, outsider.id, (tx) => tx.query('select * from business.member_permissions($1, $2)', [biz.id, staff.id])), NOT_PERMITTED);
  });

  test('a removed member is told, and rejoining does not restore old permissions', async () => {
    const member = await createUser(db);
    await addMember(db, owner.id, member, biz.id, 'staff');
    await setPermission(owner.id, member.id, 'records.void', true);
    await asUser(db, owner.id, (tx) => tx.query('select business.remove_member($1, $2)', [biz.id, member.id]));
    assert.equal((await inbox(db, member.id, 'You were removed from a business')).length, 1);
    await addMember(db, owner.id, member, biz.id, 'staff');
    assert.ok(!(await mine(member.id)).includes('records.void'));
  });
});

describe('transferring ownership', () => {
  let db, owner, member, biz;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
    member = await createUser(db);
    biz = await registerBusiness(db, owner.id);
    await addMember(db, owner.id, member, biz.id, 'staff');
  });

  const roles = async () =>
    Object.fromEntries((await db.query(`select user_id, role from business.memberships where business_id = $1 and status = 'active'`, [biz.id])).rows.map((r) => [r.user_id, r.role]));

  test('only the owner can transfer, and only to a current member', async () => {
    await assert.rejects(asUser(db, member.id, (tx) => tx.query('select business.transfer_ownership($1, $2)', [biz.id, member.id])), /Only the owner/);
    const outsider = await createUser(db);
    await assert.rejects(asUser(db, owner.id, (tx) => tx.query('select business.transfer_ownership($1, $2)', [biz.id, outsider.id])), /active team member/);
  });

  test('the former owner stays on as a manager, and can then leave', async () => {
    await asUser(db, owner.id, (tx) => tx.query('select business.transfer_ownership($1, $2)', [biz.id, member.id]));
    const after = await roles();
    assert.equal(after[member.id], 'owner');
    assert.equal(after[owner.id], 'manager');
    await asUser(db, owner.id, (tx) => tx.query('select identity.deactivate_account()'));
  });

  test('Verida staff can move ownership when an owner is gone', async () => {
    const admin = await createUser(db);
    await grantPlatformRole(db, admin.id, 'administrator');
    const next = await createUser(db);
    await addMember(db, member.id, next, biz.id, 'staff');
    await asUser(db, admin.id, (tx) => tx.query('select business.admin_transfer_ownership($1, $2)', [biz.id, next.id]));
    assert.equal((await roles())[next.id], 'owner');
  });

  test('a business can never have two owners', async () => {
    await assert.rejects(db.query(`update business.memberships set role = 'owner' where business_id = $1`, [biz.id]), /memberships_one_owner_idx/);
  });
});

describe('Verida staff permissions (FR-I12)', () => {
  let db, admin, support, reviewer;

  before(async () => {
    db = await createDatabase();
    admin = await createUser(db, { name: 'Admin' });
    support = await createUser(db, { name: 'Support' });
    reviewer = await createUser(db, { name: 'Reviewer' });
    await grantPlatformRole(db, admin.id, 'administrator');
    await asUser(db, admin.id, (tx) => tx.query(`select authz.admin_grant_platform_role($1, 'support')`, [support.email]));
    await grantPlatformRole(db, reviewer.id, 'learning_reviewer');
  });

  test('each role reaches only what it holds', async () => {
    await asUser(db, support.id, (tx) => tx.query('select * from identity.admin_search_users()'));
    await assert.rejects(asUser(db, support.id, (tx) => tx.query('select * from platform.admin_audit_log()')), NOT_PERMITTED);
    await assert.rejects(asUser(db, reviewer.id, (tx) => tx.query('select * from identity.admin_search_users()')), NOT_PERMITTED);
    const edited = await asUser(db, support.id, (tx) => tx.query(`update platform.industries set name = 'x' where code = 'retail' returning code`));
    assert.equal(edited.rows.length, 0);
  });

  test('a person can be given or denied one permission, without changing their role', async () => {
    const set = (permission, allowed) => asUser(db, admin.id, (tx) => tx.query('select authz.admin_set_staff_permission($1, $2, $3)', [reviewer.id, permission, allowed]));
    await set('monitoring.view', true);
    await asUser(db, reviewer.id, (tx) => tx.query('select * from platform.admin_usage_stats()'));
    assert.equal((await inbox(db, reviewer.id, 'Your Verida permissions changed')).length, 1);

    await set('lessons.review', false);
    const hidden = await asUser(db, reviewer.id, (tx) => tx.query('select learning.is_reviewer() as yes'));
    assert.equal(hidden.rows[0].yes, false);

    await set('lessons.review', null);
    await set('monitoring.view', null);
    const mine = await asUser(db, reviewer.id, (tx) => tx.query('select authz.my_platform_permissions() as code'));
    assert.deepEqual(mine.rows.map((r) => r.code), ['lessons.review']);
  });

  test('the role matrix can be changed, except for administrators', async () => {
    await asUser(db, admin.id, (tx) => tx.query(`select authz.admin_set_platform_role_permission('support', 'audit.view', true)`));
    await asUser(db, support.id, (tx) => tx.query('select * from platform.admin_audit_log()'));
    await asUser(db, admin.id, (tx) => tx.query(`select authz.admin_set_platform_role_permission('support', 'audit.view', false)`));
    await assert.rejects(asUser(db, admin.id, (tx) => tx.query(`select authz.admin_set_platform_role_permission('administrator', 'audit.view', false)`)), /always has every permission/);
  });

  test('staff cannot raise their own access or act against an administrator', async () => {
    await asUser(db, admin.id, (tx) => tx.query('select authz.admin_set_staff_permission($1, $2, true)', [support.id, 'roles.manage']));
    await assert.rejects(asUser(db, support.id, (tx) => tx.query('select authz.admin_set_staff_permission($1, $2, true)', [support.id, 'audit.view'])), /your own permissions/);
    await assert.rejects(asUser(db, support.id, (tx) => tx.query('select authz.admin_set_staff_permission($1, $2, true)', [reviewer.id, 'audit.view'])), /permissions you hold yourself/);
    await assert.rejects(asUser(db, support.id, (tx) => tx.query(`select authz.admin_grant_platform_role($1, 'administrator')`, [reviewer.email])), /Only an administrator/);
    await assert.rejects(asUser(db, support.id, (tx) => tx.query(`select authz.admin_revoke_platform_role($1, 'administrator')`, [admin.id])), /Only an administrator/);
    await assert.rejects(asUser(db, support.id, (tx) => tx.query(`select identity.admin_set_user_status($1, 'suspended')`, [admin.id])), /administrator's account/);
    await assert.rejects(asUser(db, admin.id, (tx) => tx.query('select authz.admin_set_staff_permission($1, $2, false)', [admin.id, 'audit.view'])), /your own permissions/);
    await asUser(db, admin.id, (tx) => tx.query('select authz.admin_set_staff_permission($1, $2, null)', [support.id, 'roles.manage']));
  });

  test('losing the last role also removes personal permissions', async () => {
    const person = await createUser(db);
    await grantPlatformRole(db, person.id, 'support');
    await asUser(db, admin.id, (tx) => tx.query('select authz.admin_set_staff_permission($1, $2, true)', [person.id, 'audit.view']));
    await asUser(db, admin.id, (tx) => tx.query(`select authz.admin_revoke_platform_role($1, 'support')`, [person.id]));
    assert.equal((await db.query('select 1 from authz.platform_staff_overrides where user_id = $1', [person.id])).rows.length, 0);
    assert.equal((await inbox(db, person.id, 'Your Verida role was removed')).length, 1);
  });

  test('staff can manage a business team, and an ordinary user cannot', async () => {
    const owner = await createUser(db);
    const member = await createUser(db);
    const biz = await registerBusiness(db, owner.id);
    await addMember(db, owner.id, member, biz.id, 'staff');
    const { rows } = await asUser(db, support.id, (tx) => tx.query('select * from business.admin_list_members($1)', [biz.id]));
    assert.equal(rows.length, 2);
    await asUser(db, support.id, (tx) => tx.query(`select business.admin_change_member_role($1, $2, 'manager')`, [biz.id, member.id]));
    await asUser(db, support.id, (tx) => tx.query(`select business.admin_set_member_permission($1, $2, 'audit.view', true)`, [biz.id, member.id]));
    const permissions = await asUser(db, support.id, (tx) => tx.query('select * from business.admin_member_permissions($1, $2)', [biz.id, member.id]));
    assert.equal(permissions.rows.find((row) => row.permission === 'audit.view').allowed, true);
    await assert.rejects(asUser(db, support.id, (tx) => tx.query('select business.admin_remove_member($1, $2)', [biz.id, owner.id])), /cannot be removed/);
    await asUser(db, support.id, (tx) => tx.query('select business.admin_remove_member($1, $2)', [biz.id, member.id]));
    await assert.rejects(asUser(db, member.id, (tx) => tx.query('select * from business.admin_list_members($1)', [biz.id])), NOT_PERMITTED);
  });

  test('staff are told about work waiting for them, and error alerts are limited', async () => {
    const owner = await createUser(db);
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, (tx) => tx.query('select learning.request_weekly_lesson($1)', [biz.id]));
    assert.equal((await inbox(db, reviewer.id, 'A lesson is waiting for review')).length, 1);

    const leaver = await createUser(db);
    await asUser(db, leaver.id, (tx) => tx.query('select identity.request_account_deletion()'));
    assert.equal((await inbox(db, admin.id, 'Account deletion requested')).length, 1);
    assert.equal((await inbox(db, support.id, 'Account deletion requested')).length, 0);

    for (let i = 0; i < 3; i += 1) {
      await asUser(db, owner.id, (tx) => tx.query(`select platform.report_event('app', 'error', 'boom')`));
    }
    assert.equal((await inbox(db, admin.id, 'Verida is reporting errors')).length, 1);
  });
});

describe('erasure (FR-A21, FR-A27, FR-B13)', () => {
  let db, admin;

  const asAdmin = (sql, params) => asUser(db, admin.id, (tx) => tx.query(sql, params));

  before(async () => {
    db = await createDatabase();
    admin = await createUser(db, { name: 'Admin' });
    await grantPlatformRole(db, admin.id, 'administrator');
  });

  test('the retention period defaults to 90 days and blocks erasure until it ends', async () => {
    assert.equal((await asAdmin('select platform.admin_get_retention() as days')).rows[0].days, 90);
    const user = await createUser(db);
    await asUser(db, user.id, (tx) => tx.query('select identity.request_account_deletion()'));
    await assert.rejects(asAdmin('select identity.admin_erase_account($1)', [user.id]), /retention period runs until/);
    const queue = await asAdmin('select * from platform.admin_deletion_queue()');
    assert.ok(queue.rows.some((row) => row.kind === 'account' && row.id === user.id));
  });

  test('erasing an account removes the person and keeps the business\'s records', async () => {
    await asAdmin('select platform.admin_set_retention(0)');
    const owner = await createUser(db);
    const leaver = await createUser(db, { name: 'Private Person' });
    const biz = await registerBusiness(db, owner.id);
    await addMember(db, owner.id, leaver, biz.id, 'staff');
    const { rows: sales } = await asUser(db, leaver.id, (tx) => tx.query(
      `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
       values ($1, '2026-10-01', 'Eggs', 'Egg sales', 1, 2) returning id`, [biz.id]));
    await asUser(db, leaver.id, (tx) => tx.query('select identity.request_account_deletion()'));
    await db.query(`insert into auth.sessions (user_id) values ($1)`, [leaver.id]);
    await db.query(`insert into auth.identities (user_id) values ($1)`, [leaver.id]);

    await asAdmin('select identity.admin_erase_account($1)', [leaver.id]);

    const profile = (await db.query('select * from identity.profiles where id = $1', [leaver.id])).rows[0];
    assert.equal(profile.full_name, 'Deleted user');
    assert.equal(profile.account_status, 'erased');
    assert.ok(!profile.email.includes('verida.test'));
    const auth = (await db.query('select * from auth.users where id = $1', [leaver.id])).rows[0];
    assert.equal(auth.email, profile.email);
    assert.deepEqual(auth.raw_user_meta_data, {});
    assert.ok(auth.banned_until > new Date('2900-01-01'));
    assert.equal((await db.query('select 1 from auth.sessions where user_id = $1 union all select 1 from auth.identities where user_id = $1', [leaver.id])).rows.length, 0);
    assert.equal((await db.query('select 1 from business.memberships where user_id = $1', [leaver.id])).rows.length, 0);
    assert.equal((await db.query('select 1 from notifications.notifications where user_id = $1', [leaver.id])).rows.length, 0);
    assert.equal((await db.query('select 1 from notifications.outbox where to_email = $1', [leaver.email])).rows.length, 0);
    assert.equal((await db.query('select created_by from records.sales_transactions where id = $1', [sales[0].id])).rows[0].created_by, leaver.id);

    const trail = await db.query(`select old_data::text as o, new_data::text as n from audit.record_changes where record_id = $1 and table_name = 'profiles'`, [leaver.id]);
    assert.ok(trail.rows.every((row) => !`${row.o}${row.n}`.includes('Private Person')));

    await assert.rejects(asAdmin(`select identity.admin_set_user_status($1, 'active')`, [leaver.id]), /could not be found/);
    await asAdmin('select platform.admin_set_retention(90)');
  });

  test('an account cannot be erased unless deletion was requested, or while it owns a business', async () => {
    await asAdmin('select platform.admin_set_retention(0)');
    const owner = await createUser(db);
    await registerBusiness(db, owner.id);
    await assert.rejects(asAdmin('select identity.admin_erase_account($1)', [owner.id]), /deletion request/);
    await db.query(`update identity.profiles set account_status = 'deletion_requested' where id = $1`, [owner.id]);
    await assert.rejects(asAdmin('select identity.admin_erase_account($1)', [owner.id]), /still owns a business/);
    await asAdmin('select platform.admin_set_retention(90)');
  });

  test('erasing a business removes its records and audit copies, and tells the team', async () => {
    await asAdmin('select platform.admin_set_retention(0)');
    const owner = await createUser(db);
    const biz = await registerBusiness(db, owner.id, { name: 'Closing Co' });
    const eggs = await activityTypeId(db, 'poultry', 'eggs_collected');
    await asUser(db, owner.id, async (tx) => {
      await tx.query(`insert into records.products (business_id, kind, name, unit, selling_price) values ($1, 'product', 'Tray', 'tray', 10)`, [biz.id]);
      const product = await tx.query('select id from records.products where business_id = $1', [biz.id]);
      await tx.query(
        `insert into records.sales_transactions (business_id, occurred_on, product_id, item_name, category, quantity, unit_price)
         values ($1, '2026-10-01', $2, 'Tray', 'Egg sales', 1, 10)`, [biz.id, product.rows[0].id]);
      // Sales and activity records RESTRICT deletion of the products and flocks they refer to.
      const flock = await tx.query(`insert into operations.flocks (business_id, name) values ($1, 'Layers') returning id`, [biz.id]);
      await recordActivity(tx, biz.id, eggs, '2026-10-01', 5, { unit: 'eggs', flockId: flock.rows[0].id });
      await tx.query(`insert into records.expenses (business_id, occurred_on, category, description, amount) values ($1, '2026-10-01', 'Feed', 'Feed', 5)`, [biz.id]);
    });
    await assert.rejects(asAdmin('select business.admin_erase_business($1)', [biz.id]), /deletion request/);
    await asUser(db, owner.id, (tx) => tx.query(`select business.set_business_status($1, 'deletion_requested')`, [biz.id]));

    await asAdmin('select business.admin_erase_business($1)', [biz.id]);

    assert.equal((await db.query('select 1 from business.businesses where id = $1', [biz.id])).rows.length, 0);
    assert.equal((await db.query('select 1 from records.sales_transactions where business_id = $1', [biz.id])).rows.length, 0);
    const trail = await db.query('select new_data, old_data, record_id from audit.record_changes where business_id = $1', [biz.id]);
    assert.equal(trail.rows.length, 0);
    const marker = await db.query(`select actor_id from audit.record_changes where record_id = $1 and old_data is null and new_data is null`, [biz.id]);
    assert.equal(marker.rows[0].actor_id, admin.id);
    assert.equal((await inbox(db, owner.id, 'Business deleted')).length, 1);
    await asAdmin('select platform.admin_set_retention(90)');
  });

  test('a request can be cancelled, and a learner profile erased on its own', async () => {
    await asAdmin('select platform.admin_set_retention(0)');
    const user = await createUser(db);
    await asUser(db, user.id, (tx) => tx.query('select identity.request_account_deletion()'));
    await asAdmin('select identity.admin_cancel_deletion($1)', [user.id]);
    const { rows } = await db.query('select account_status, deletion_requested_at from identity.profiles where id = $1', [user.id]);
    assert.deepEqual([rows[0].account_status, rows[0].deletion_requested_at], ['active', null]);

    await asUser(db, user.id, (tx) => tx.query(`select learning.set_learner_profile_status('deletion_requested')`));
    await asAdmin('select learning.admin_restore_learner_profile($1)', [user.id]);
    await asUser(db, user.id, (tx) => tx.query(`select learning.set_learner_profile_status('deletion_requested')`));
    await asAdmin('select learning.admin_erase_learner_profile($1)', [user.id]);
    assert.equal((await db.query('select 1 from learning.learner_profiles where user_id = $1', [user.id])).rows.length, 0);
    await asAdmin('select platform.admin_set_retention(90)');
  });

  test('every erasure function refuses anyone without the permission', async () => {
    const support = await createUser(db);
    await grantPlatformRole(db, support.id, 'support');
    for (const call of [
      'select * from platform.admin_deletion_queue()',
      'select platform.admin_get_retention()',
      'select platform.admin_set_retention(0)',
      `select identity.admin_erase_account('${admin.id}')`,
      `select identity.admin_cancel_deletion('${admin.id}')`,
      `select business.admin_erase_business('${admin.id}')`,
      `select business.admin_cancel_deletion('${admin.id}')`,
      `select learning.admin_erase_learner_profile('${admin.id}')`,
      `select learning.admin_restore_learner_profile('${admin.id}')`,
    ]) {
      await assert.rejects(asUser(db, support.id, (tx) => tx.query(call)), NOT_PERMITTED, call);
    }
  });
});

describe('lesson activities and assignment (FR-F35, FR-F36, section 5)', () => {
  let db, admin, owner, biz, contentId;

  const lessonId = async () => (await db.query('select id from learning.lessons where learner_id = $1 order by created_at desc limit 1', [owner.id])).rows[0].id;
  const approve = async (id) => asUser(db, admin.id, (tx) => tx.query(`select learning.review_lesson($1, 'approve', null)`, [id]));

  before(async () => {
    db = await createDatabase();
    admin = await createUser(db);
    await grantPlatformRole(db, admin.id, 'administrator');
    owner = await createUser(db);
    biz = await registerBusiness(db, owner.id);
    const created = await asUser(db, admin.id, (tx) => tx.query(
      `insert into learning.content (topic, objective, title, intro, example, challenge, approval_status, activities)
       values ('Costs', 'Know your costs', 'Costs', 'Intro', 'Example', 'Challenge', 'approved', '{"List your costs","Pick the biggest"}') returning id, version`));
    contentId = created.rows[0].id;
  });

  test('only approved content can be assigned, and only to a member of that business', async () => {
    const draft = await asUser(db, admin.id, (tx) => tx.query(`insert into learning.content (topic, objective, title, intro, example, challenge) values ('x', 'x', 'x', 'x', 'x', 'x') returning id`));
    await assert.rejects(asUser(db, admin.id, (tx) => tx.query('select learning.admin_assign_lesson($1, $2, $3)', [draft.rows[0].id, owner.id, biz.id])), /approved content/);
    const outsider = await createUser(db);
    await assert.rejects(asUser(db, admin.id, (tx) => tx.query('select learning.admin_assign_lesson($1, $2, $3)', [contentId, outsider.id, biz.id])), /not a member/);
    await assert.rejects(asUser(db, owner.id, (tx) => tx.query('select learning.admin_assign_lesson($1, $2, $3)', [contentId, owner.id, biz.id])), NOT_PERMITTED);
  });

  test('an assigned lesson waits for review, with its activities hidden from the learner', async () => {
    const workspaces = await asUser(db, admin.id, (tx) => tx.query('select * from learning.admin_learner_workspaces($1)', [owner.email]));
    assert.equal(workspaces.rows[0].business_id, biz.id);
    await asUser(db, admin.id, (tx) => tx.query('select learning.admin_assign_lesson($1, $2, $3)', [contentId, owner.id, biz.id]));
    await assert.rejects(asUser(db, admin.id, (tx) => tx.query('select learning.admin_assign_lesson($1, $2, $3)', [contentId, owner.id, biz.id])), /already has a lesson/);

    const id = await lessonId();
    const reviewerView = await asUser(db, admin.id, (tx) => tx.query('select prompt from learning.lesson_activities where lesson_id = $1 order by position', [id]));
    assert.deepEqual(reviewerView.rows.map((r) => r.prompt), ['List your costs', 'Pick the biggest']);
    const learnerView = await asUser(db, owner.id, (tx) => tx.query('select prompt from learning.lesson_activities'));
    assert.equal(learnerView.rows.length, 0);
  });

  test('a reviewer can change the activities until the lesson is decided', async () => {
    const id = await lessonId();
    await assert.rejects(asUser(db, owner.id, (tx) => tx.query('select learning.set_lesson_activities($1, $2)', [id, ['x']])), /Only a learning reviewer/);
    await asUser(db, admin.id, (tx) => tx.query('select learning.set_lesson_activities($1, $2)', [id, ['List your costs', ' ', 'Rank them']]));
    await approve(id);
    const { rows } = await asUser(db, owner.id, (tx) => tx.query('select position, prompt from learning.lesson_activities order by position'));
    assert.deepEqual(rows.map((r) => [r.position, r.prompt]), [[1, 'List your costs'], [2, 'Rank them']]);
    await assert.rejects(asUser(db, admin.id, (tx) => tx.query('select learning.set_lesson_activities($1, $2)', [id, ['x']])), /no longer be edited/);
  });

  test('a learner answers each activity, and another user cannot', async () => {
    const { rows } = await asUser(db, owner.id, (tx) => tx.query('select id from learning.lesson_activities order by position'));
    await asUser(db, owner.id, (tx) => tx.query('select learning.submit_activity_response($1, $2)', [rows[0].id, 'Feed and rent']));
    await asUser(db, owner.id, (tx) => tx.query('select learning.submit_activity_response($1, $2)', [rows[0].id, 'Feed, rent, water']));
    const saved = await asUser(db, owner.id, (tx) => tx.query('select answer from learning.activity_responses'));
    assert.deepEqual(saved.rows.map((r) => r.answer), ['Feed, rent, water']);
    const stranger = await createUser(db);
    await assert.rejects(asUser(db, stranger.id, (tx) => tx.query('select learning.submit_activity_response($1, $2)', [rows[0].id, 'x'])), /not available/);
    const hidden = await asUser(db, stranger.id, (tx) => tx.query('select answer from learning.activity_responses'));
    assert.equal(hidden.rows.length, 0);
  });

  test('a learner can delete a response: the words go and the completion stays', async () => {
    const id = await lessonId();
    await asUser(db, owner.id, (tx) => tx.query(`select learning.complete_lesson($1, 'My private answer', 5, 'Good')`, [id]));
    const stranger = await createUser(db);
    await assert.rejects(asUser(db, stranger.id, (tx) => tx.query('select learning.delete_lesson_response($1)', [id])), /your own responses/);

    await asUser(db, owner.id, (tx) => tx.query('select learning.delete_lesson_response($1)', [id]));

    assert.equal((await db.query('select 1 from learning.lesson_responses where lesson_id = $1', [id])).rows.length, 0);
    assert.equal((await db.query('select 1 from learning.activity_responses where learner_id = $1', [owner.id])).rows.length, 0);
    assert.equal((await db.query('select status from learning.lessons where id = $1', [id])).rows[0].status, 'completed');
    const trail = await db.query(`select actor_id, old_data::text as old from audit.record_changes where table_name = 'lesson_responses'`);
    assert.equal(trail.rows.length, 1);
    assert.equal(trail.rows[0].actor_id, owner.id);
    assert.equal(trail.rows[0].old, null);
  });

  test('changing a content item\'s activities creates a new version (FR-F15)', async () => {
    const { rows } = await asUser(db, admin.id, (tx) => tx.query(`update learning.content set activities = '{"New"}' where id = $1 returning version`, [contentId]));
    assert.equal(rows[0].version, 2);
  });
});

describe('configurable activity rules (FR-I07)', () => {
  let db, owner, biz, typeId;

  const setRules = (sql) => db.query(`update platform.activity_types set ${sql} where id = $1`, [typeId]);
  const save = (quantity, unit = 'eggs', notes = null) =>
    asUser(db, owner.id, (tx) => tx.query(
      `insert into operations.activity_records (business_id, activity_type_id, occurred_on, quantity, unit, notes)
       values ($1, $2, '2026-10-01', $3, $4, $5) returning id`, [biz.id, typeId, quantity, unit, notes]));

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
    biz = await registerBusiness(db, owner.id);
    typeId = await activityTypeId(db, 'poultry', 'eggs_collected');
  });

  test('applies a minimum, whole numbers, a required note and allowed units', async () => {
    await setRules(`min_quantity = 2, whole_numbers_only = true, notes_required = true, allowed_units = '{eggs,trays}'`);
    await assert.rejects(save(1, 'eggs', 'n'), /cannot be less than 2/);
    await assert.rejects(save(2.5, 'eggs', 'n'), /whole number/);
    await assert.rejects(save(3, 'eggs', '  '), /needs a note/);
    await assert.rejects(save(3, 'kg', 'n'), /one of these units: eggs, trays/);
    await save(3, 'Trays', 'n');
  });

  test('a rule added later does not stop an older record being voided', async () => {
    await setRules(`min_quantity = null, whole_numbers_only = false, notes_required = false, allowed_units = '{}'`);
    const { rows } = await save(1);
    await setRules('notes_required = true');
    await asUser(db, owner.id, (tx) => tx.query(`select operations.void_activity($1, 'Mistake')`, [rows[0].id]));
    await setRules('notes_required = false');
  });

  test('a minimum above the maximum is refused', async () => {
    await assert.rejects(setRules('min_quantity = 10, max_quantity = 1'), /activity_types_quantity_range_check/);
  });

  test('old rules still apply', async () => {
    await recordActivity(db, biz.id, typeId, '2026-10-02', 5);
    await assert.rejects(save(-1), /cannot be negative/);
  });
});
