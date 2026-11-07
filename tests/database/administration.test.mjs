// FR-A22 to A27, FR-B14 to B18, FR-F08 to F15, FR-G21 to G22, FR-I01 to I12: every administrative
// action, and proof that an ordinary user cannot perform any of them.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { activityTypeId, asUser, createDatabase, createUser, grantPlatformRole, recordActivity, registerBusiness } from './harness.mjs';

const ADMIN_CALLS = (id, email) => [
  `select * from identity.admin_search_users()`,
  `select * from identity.admin_get_user('${id}')`,
  `select identity.admin_update_user('${id}', 'x', null)`,
  `select identity.admin_set_user_status('${id}', 'suspended')`,
  `select identity.admin_initiate_deletion('${id}')`,
  `select * from business.admin_search_businesses()`,
  `select * from business.admin_get_business('${id}')`,
  `select business.admin_update_configuration('${id}', 'retail', 'a', 'b', 'BWP')`,
  `select business.admin_set_status('${id}', 'suspended')`,
  `select * from authz.admin_list_platform_roles()`,
  `select authz.admin_grant_platform_role('${email}', 'administrator')`,
  `select authz.admin_revoke_platform_role('${id}', 'administrator')`,
  `select authz.admin_set_role_permission('staff', 'records.void', true)`,
  `select * from platform.admin_recent_events()`,
  `select * from platform.admin_usage_stats()`,
  `select * from platform.admin_audit_log()`,
  `select * from assistant.admin_list_requests()`,
  `select * from assistant.admin_usage('2026-01-01', '2026-12-31')`,
];

describe('administration', () => {
  let db, admin, owner, outsider, biz;

  before(async () => {
    db = await createDatabase();
    admin = await createUser(db, { name: 'Admin' });
    await grantPlatformRole(db, admin.id, 'administrator');
    owner = await createUser(db, { name: 'Neo Moeng' });
    outsider = await createUser(db, { name: 'Outsider' });
    biz = await registerBusiness(db, owner.id, { name: 'Vinabbie' });
  });

  const asAdmin = (sql, params) => asUser(db, admin.id, (tx) => tx.query(sql, params));

  test('an ordinary user is refused every administrative function', async () => {
    for (const call of ADMIN_CALLS(owner.id, outsider.email)) {
      await assert.rejects(asUser(db, outsider.id, (tx) => tx.query(call)), /do not have permission to do this on the Verida platform/, call);
    }
    const self = await asUser(db, outsider.id, (tx) => tx.query('select authz.has_platform_role($1) as yes', ['administrator']));
    assert.equal(self.rows[0].yes, false);
  });

  test('a suspended administrator loses administrative access', async () => {
    const former = await createUser(db);
    await grantPlatformRole(db, former.id, 'administrator');
    await asAdmin('select identity.admin_set_user_status($1, $2)', [former.id, 'suspended']);
    await assert.rejects(asUser(db, former.id, (tx) => tx.query('select * from identity.admin_search_users()')), /do not have permission to do this on the Verida platform/);
  });

  test('searches and filters users by name, email, date and status (FR-A22, A23)', async () => {
    const byName = await asAdmin('select id from identity.admin_search_users($1)', ['moeng']);
    assert.deepEqual(byName.rows.map((r) => r.id), [owner.id]);
    const byEmail = await asAdmin('select id from identity.admin_search_users($1)', [owner.email.slice(0, 12)]);
    assert.deepEqual(byEmail.rows.map((r) => r.id), [owner.id]);
    const future = await asAdmin(`select id from identity.admin_search_users(null, null, '2999-01-01')`);
    assert.equal(future.rows.length, 0);
    const active = await asAdmin(`select account_status from identity.admin_search_users(null, 'active')`);
    assert.ok(active.rows.every((r) => r.account_status === 'active'));
  });

  test('shows and updates permitted attributes (FR-A24, A25)', async () => {
    await asAdmin('select identity.admin_update_user($1, $2, $3)', [owner.id, 'Neo M', '+267 7000']);
    const { rows } = await asAdmin('select * from identity.admin_get_user($1)', [owner.id]);
    assert.equal(rows[0].full_name, 'Neo M');
    assert.equal(rows[0].phone, '+267 7000');
    assert.equal(rows[0].email_confirmed, true);
    assert.equal(Number(rows[0].business_count), 1);
    assert.deepEqual(rows[0].platform_roles, []);
    await asAdmin('select identity.admin_update_user($1, $2, null)', [owner.id, 'Neo Moeng']);
  });

  test('suspends and reactivates, cutting access and telling the person (FR-A26, FR-H05)', async () => {
    const user = await createUser(db);
    const own = await registerBusiness(db, user.id);
    await asAdmin('select identity.admin_set_user_status($1, $2)', [user.id, 'suspended']);
    await assert.rejects(
      asUser(db, user.id, (tx) => tx.query(`select * from analytics.compute_kpis($1, '2026-01-01', '2026-01-31')`, [own.id])),
      /do not have permission/,
    );
    await asAdmin('select identity.admin_set_user_status($1, $2)', [user.id, 'active']);
    const inbox = await asUser(db, user.id, (tx) => tx.query(`select title from notifications.notifications where title = 'Your account status changed'`));
    assert.equal(inbox.rows.length, 2);
  });

  test('protects an administrator from locking themselves out', async () => {
    await assert.rejects(asAdmin('select identity.admin_set_user_status($1, $2)', [admin.id, 'suspended']), /your own account/);
    await assert.rejects(asAdmin('select identity.admin_initiate_deletion($1)', [admin.id]), /your own account/);
    const sole = await createDatabase();
    const only = await createUser(sole);
    await grantPlatformRole(sole, only.id, 'administrator');
    await assert.rejects(
      asUser(sole, only.id, (tx) => tx.query(`select authz.admin_revoke_platform_role($1, 'administrator')`, [only.id])),
      /at least one administrator/,
    );
  });

  test('initiates deletion under the retention policy (FR-A27)', async () => {
    const user = await createUser(db);
    await asAdmin('select identity.admin_initiate_deletion($1)', [user.id]);
    const { rows } = await asAdmin('select account_status from identity.admin_get_user($1)', [user.id]);
    assert.equal(rows[0].account_status, 'deletion_requested');
  });

  test('searches businesses by name, industry, location and status (FR-B14, B15)', async () => {
    const byName = await asAdmin('select id, owner_email, member_count from business.admin_search_businesses($1)', ['vinab']);
    assert.equal(byName.rows[0].id, biz.id);
    assert.equal(byName.rows[0].owner_email, owner.email);
    assert.equal(Number(byName.rows[0].member_count), 1);
    assert.equal((await asAdmin(`select id from business.admin_search_businesses(null, 'retail')`)).rows.length, 0);
    assert.equal((await asAdmin(`select id from business.admin_search_businesses(null, null, 'gaborone')`)).rows.length >= 1, true);
    assert.equal((await asAdmin(`select id from business.admin_search_businesses(null, null, null, 'suspended')`)).rows.length, 0);
  });

  test('updates configuration and suspends a business (FR-B16 to B18)', async () => {
    const other = await registerBusiness(db, owner.id, { name: 'Second' });
    await asAdmin(`select business.admin_update_configuration($1, 'retail', 'Just starting', 'Medium-scale', 'ZAR')`, [other.id]);
    const { rows } = await asAdmin('select * from business.admin_get_business($1)', [other.id]);
    assert.equal(rows[0].industry_code, 'retail');
    assert.equal(rows[0].currency, 'ZAR');

    await asAdmin(`select business.admin_set_status($1, 'suspended')`, [other.id]);
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query(`select business.set_business_status($1, 'active')`, [other.id])),
      /suspended/,
    );
    await asAdmin(`select business.admin_set_status($1, 'active')`, [other.id]);
  });

  test('assigns and removes platform roles, and audits it (FR-I11, I12)', async () => {
    const user = await createUser(db);
    await asAdmin(`select authz.admin_grant_platform_role($1, 'learning_reviewer')`, [user.email]);
    const listed = await asAdmin('select user_id, role from authz.admin_list_platform_roles()');
    assert.ok(listed.rows.some((r) => r.user_id === user.id && r.role === 'learning_reviewer'));
    await asAdmin(`select authz.admin_revoke_platform_role($1, 'learning_reviewer')`, [user.id]);
    const audit = await asAdmin(`select action from platform.admin_audit_log('platform_role_assignments')`);
    assert.ok(audit.rows.some((r) => r.action === 'DELETE'));
    await assert.rejects(asAdmin(`select authz.admin_grant_platform_role('nobody@x.co', 'administrator')`), /No account/);
  });

  test('edits the permission matrix, which takes effect at once, but not for owners (FR-I12)', async () => {
    const staff = await createUser(db);
    const shop = await registerBusiness(db, owner.id, { name: 'Matrix' });
    const invite = await asUser(db, owner.id, (tx) => tx.query(`select * from business.invite_member($1, $2, 'staff')`, [shop.id, staff.email]));
    await asUser(db, staff.id, (tx) => tx.query('select business.respond_to_invitation($1, true)', [invite.rows[0].id]));
    const canVoid = async () => (await asUser(db, staff.id, (tx) => tx.query(`select authz.has_business_permission($1, 'records.void') as yes`, [shop.id]))).rows[0].yes;

    assert.equal(await canVoid(), false);
    await asAdmin(`select authz.admin_set_role_permission('staff', 'records.void', true)`);
    assert.equal(await canVoid(), true);
    await asAdmin(`select authz.admin_set_role_permission('staff', 'records.void', false)`);
    assert.equal(await canVoid(), false);
    await assert.rejects(asAdmin(`select authz.admin_set_role_permission('owner', 'records.void', false)`), /owner role/);
  });

  test('manages industry configuration through RLS (FR-I01 to I07)', async () => {
    await asUser(db, admin.id, async (tx) => {
      await tx.query(`insert into platform.industries (code, name, short_name, description, icon, chart_title) values ('fishing', 'Fishing', 'Fish', 'Boats', 'fish', 'Catch')`);
      await tx.query(`insert into platform.record_categories (industry_code, kind, name) values ('fishing', 'sale', 'Fresh fish')`);
      await tx.query(`insert into platform.activity_types (industry_code, code, name, default_unit, max_quantity) values ('fishing', 'catch', 'Catch', 'kg', 500)`);
      await tx.query(`insert into platform.kpi_definitions (code, name, explanation, formula_text, required_data, unit_kind, formula, activity_code) values ('catch_total', 'Catch', 'x', 'Sum', 'Catch records', 'quantity', 'activity_total', 'catch')`);
      await tx.query(`insert into platform.industry_kpis (industry_code, kpi_code, is_highlight) values ('fishing', 'catch_total', true), ('fishing', 'revenue', true)`);
    });

    const boat = await registerBusiness(db, owner.id, { name: 'Boat', industry: 'fishing' });
    const typeId = await activityTypeId(db, 'fishing', 'catch');
    await asUser(db, owner.id, (tx) => recordActivity(tx, boat.id, typeId, '2026-10-02', 100));
    const kpis = await asUser(db, owner.id, (tx) => tx.query(`select code, value from analytics.compute_kpis($1, '2026-10-01', '2026-10-31')`, [boat.id]));
    assert.equal(Number(kpis.rows.find((r) => r.code === 'catch_total').value), 100);

    // FR-I07: the configured limit is enforced on every write.
    await assert.rejects(asUser(db, owner.id, (tx) => recordActivity(tx, boat.id, typeId, '2026-10-03', 501)), /cannot be more than 500/);

    // FR-I04: a deactivated industry can no longer be chosen.
    await asAdmin(`update platform.industries set is_active = false where code = 'fishing'`);
    await assert.rejects(registerBusiness(db, owner.id, { name: 'Late', industry: 'fishing' }), /supported business type/);

    const audit = await asAdmin(`select action from platform.admin_audit_log('industries')`);
    assert.ok(audit.rows.length >= 2);

    const refused = await asUser(db, owner.id, (tx) => tx.query(`update platform.industries set name = 'x' where code = 'retail'`));
    assert.equal(refused.affectedRows, 0);
  });

  test('reports usage statistics and errors (FR-I09, I10)', async () => {
    await asUser(db, owner.id, (tx) => tx.query(`select platform.report_event('app', 'error', 'Something broke')`));
    const stats = await asAdmin('select metric, value from platform.admin_usage_stats()');
    const metric = Object.fromEntries(stats.rows.map((r) => [r.metric, Number(r.value)]));
    assert.ok(metric.users_total >= 3);
    assert.ok(metric.businesses_total >= 1);
    assert.equal(metric.errors_recent, 1);
    assert.equal(metric['industry:poultry'] >= 1, true);
    const events = await asAdmin('select source, severity, message from platform.admin_recent_events()');
    assert.deepEqual(events.rows[0], { source: 'app', severity: 'error', message: 'Something broke' });
    await assert.rejects(asUser(db, owner.id, (tx) => tx.query('select * from platform.system_events')), /permission denied/);
  });

  test('the audit log names changed fields, and an owner sees only their own history (FR-C11, I11)', async () => {
    const mine = await registerBusiness(db, owner.id, { name: 'History' });
    const sale = await asUser(db, owner.id, (tx) => tx.query(
      `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price) values ($1, '2026-10-01', 'Eggs', 'Egg sales', 2, 10) returning id`, [mine.id]));
    await asUser(db, owner.id, (tx) => tx.query('update records.sales_transactions set quantity = 3 where id = $1', [sale.rows[0].id]));

    const log = await asAdmin(`select action, changed_fields, actor_email from platform.admin_audit_log('sales_transactions', 'UPDATE')`);
    assert.deepEqual(log.rows[0].changed_fields, ['quantity', 'total_amount']);
    assert.equal(log.rows[0].actor_email, owner.email);

    const history = await asUser(db, owner.id, (tx) => tx.query('select table_name, action from business.change_history($1)', [mine.id]));
    assert.ok(history.rows.some((r) => r.table_name === 'sales_transactions' && r.action === 'UPDATE'));
    await assert.rejects(asUser(db, outsider.id, (tx) => tx.query('select * from business.change_history($1)', [mine.id])), /do not have permission/);
  });

  test('AI logs show metadata only, to administrators only (FR-G21 to G23)', async () => {
    await asUser(db, owner.id, (tx) => tx.query(
      `insert into assistant.request_log (user_id, business_id, intent, outcome, latency_ms, source) values ($1, $2, 'kpi:revenue', 'answered', 120, 'ai')`, [owner.id, biz.id]));
    const list = await asAdmin('select * from assistant.admin_list_requests()');
    assert.equal(list.rows[0].intent, 'kpi:revenue');
    assert.equal(list.rows[0].business_name, 'Vinabbie');
    assert.ok(!('content' in list.rows[0]) && !('question' in list.rows[0]));
    const usage = await asAdmin(`select * from assistant.admin_usage(current_date - 1, current_date)`);
    assert.equal(Number(usage.rows[0].requests), 1);
    assert.equal(Number(usage.rows[0].from_ai), 1);
    assert.equal(Number(usage.rows[0].average_latency_ms), 120);
  });
});

describe('learning content and lesson lifecycle', () => {
  let db, admin, reviewer, learner, biz;

  before(async () => {
    db = await createDatabase();
    admin = await createUser(db);
    await grantPlatformRole(db, admin.id, 'administrator');
    reviewer = await createUser(db);
    await grantPlatformRole(db, reviewer.id, 'learning_reviewer');
    learner = await createUser(db);
    biz = await registerBusiness(db, learner.id, { name: 'Farm' });
  });

  const addContent = (tx, overrides = {}) => tx.query(
    `insert into learning.content (industry_code, topic, objective, title, intro, example, challenge, approval_status)
     values ('poultry', $1, 'Objective', $2, 'Intro', 'Example', 'Challenge', 'approved') returning id, version`,
    [overrides.topic ?? 'Topic', overrides.title ?? 'New content'],
  );

  test('administrators create and edit content, and each edit is a new version (FR-F08 to F15)', async () => {
    const { id, version } = await asUser(db, admin.id, async (tx) => (await addContent(tx)).rows[0]);
    assert.equal(version, 1);
    await asUser(db, admin.id, (tx) => tx.query(`update learning.content set title = 'Edited' where id = $1`, [id]));
    await asUser(db, admin.id, (tx) => tx.query(`update learning.content set topic = 'Category only' where id = $1`, [id]));
    const row = (await db.query('select version, title from learning.content where id = $1', [id])).rows[0];
    assert.deepEqual(row, { version: 2, title: 'Edited' });
  });

  test('content is archived, never deleted, and archived content is unavailable (FR-F12)', async () => {
    const { id } = await asUser(db, admin.id, async (tx) => (await addContent(tx, { title: 'To archive' })).rows[0]);
    await assert.rejects(asUser(db, admin.id, (tx) => tx.query('delete from learning.content where id = $1', [id])), /permission denied/);
    await asUser(db, admin.id, (tx) => tx.query(`update learning.content set approval_status = 'archived' where id = $1`, [id]));
    const seen = await asUser(db, learner.id, (tx) => tx.query('select id from learning.content where id = $1', [id]));
    assert.equal(seen.rows.length, 0);
  });

  test('a learner cannot write learning content', async () => {
    const result = await asUser(db, learner.id, (tx) => tx.query(`update learning.content set title = 'x'`));
    assert.equal(result.affectedRows, 0);
    await assert.rejects(asUser(db, learner.id, (tx) => addContent(tx)), /row-level security/);
  });

  test('topics the learner chose are preferred (FR-F03, F18)', async () => {
    const someone = await createUser(db);
    const farm = await registerBusiness(db, someone.id, { name: 'Picky' });
    await db.query(
      `insert into records.expenses (business_id, occurred_on, category, description, amount) values ($1, '2026-10-01', 'Feed', 'Feed', 1)`,
      [farm.id],
    );
    await asUser(db, admin.id, (tx) => addContent(tx, { topic: 'Cash flow basics', title: 'About cash' }));
    await asUser(db, someone.id, async (tx) => {
      await tx.query(`insert into learning.learner_profiles (user_id, topics) values ($1, array['cash flow'])`, [someone.id]);
      await tx.query('select learning.request_weekly_lesson($1)', [farm.id]);
    });
    const { rows } = await db.query('select title from learning.lessons where learner_id = $1', [someone.id]);
    assert.equal(rows[0].title, 'About cash');
  });

  test('the generation context covers business, preferences and history, for members only (FR-F17, F18)', async () => {
    const context = (await asUser(db, learner.id, (tx) => tx.query('select learning.lesson_generation_context($1) as c', [biz.id]))).rows[0].c;
    assert.equal(context.business.name, 'Farm');
    assert.equal(context.already_requested, false);
    assert.ok(context.candidates.length > 0);
    assert.equal(context.learner.preferred_format, 'reading');
    const stranger = await createUser(db);
    await assert.rejects(asUser(db, stranger.id, (tx) => tx.query('select learning.lesson_generation_context($1)', [biz.id])), /not a member/);
  });

  test('clients cannot store an AI lesson themselves, bypassing generation (FR-F21)', async () => {
    await assert.rejects(
      asUser(db, learner.id, (tx) => tx.query(
        `select learning.store_generated_lesson($1, $2, gen_random_uuid(), 'c', 'o', 't', 'i', 'e', 'c', '{}')`, [learner.id, biz.id])),
      /permission denied/,
    );
  });

  test('a stored AI lesson waits for review like any other (FR-F16, F21, F22)', async () => {
    const someone = await createUser(db);
    const farm = await registerBusiness(db, someone.id, { name: 'AI Farm' });
    const content = (await db.query(`select id from learning.content where approval_status = 'approved' limit 1`)).rows[0].id;
    const { rows } = await db.query(
      `select learning.store_generated_lesson($1, $2, $3, 'AI Farm', 'Objective', 'AI title', 'Intro', 'Example', 'Challenge', '{"k":1}') as id`,
      [someone.id, farm.id, content],
    );
    const hidden = await asUser(db, someone.id, (tx) => tx.query('select id from learning.lessons'));
    assert.equal(hidden.rows.length, 0);
    const queue = await asUser(db, reviewer.id, (tx) => tx.query('select generated_by, status from learning.lessons where id = $1', [rows[0].id]));
    assert.deepEqual(queue.rows[0], { generated_by: 'ai', status: 'pending_review' });
    await assert.rejects(
      db.query(`select learning.store_generated_lesson($1, $2, gen_random_uuid(), 'x', 'o', 't', 'i', 'e', 'c', '{}')`, [someone.id, farm.id]),
      /approved content/,
    );
  });

  test('a reviewer can regenerate from other content, and only a reviewer (FR-F29)', async () => {
    const someone = await createUser(db);
    const farm = await registerBusiness(db, someone.id, { name: 'Regen' });
    await db.query(`insert into records.expenses (business_id, occurred_on, category, description, amount) values ($1, '2026-10-01', 'Feed', 'Feed', 1)`, [farm.id]);
    await asUser(db, someone.id, (tx) => tx.query('select learning.request_weekly_lesson($1)', [farm.id]));
    const before = (await db.query('select id, title from learning.lessons where learner_id = $1', [someone.id])).rows[0];

    await assert.rejects(asUser(db, someone.id, (tx) => tx.query(`select learning.regenerate_from_content($1, 'x')`, [before.id])), /Only a learning reviewer/);
    await asUser(db, reviewer.id, (tx) => tx.query(`select learning.regenerate_from_content($1, 'Try another')`, [before.id]));

    const after = (await db.query('select title, status from learning.lessons where id = $1', [before.id])).rows[0];
    assert.notEqual(after.title, before.title);
    assert.equal(after.status, 'pending_review');
    const review = (await db.query('select decision, comments from learning.lesson_reviews where lesson_id = $1', [before.id])).rows[0];
    assert.deepEqual(review, { decision: 'regenerate', comments: 'Try another' });

    const context = await asUser(db, reviewer.id, (tx) => tx.query('select learning.lesson_regeneration_context($1) as c', [before.id]));
    assert.equal(context.rows[0].c.lesson.title, after.title);
    await assert.rejects(asUser(db, someone.id, (tx) => tx.query('select learning.lesson_regeneration_context($1)', [before.id])), /Only a learning reviewer/);
  });

  test('a learner can correct a response, and reviewers can archive decided lessons (section 5)', async () => {
    const someone = await createUser(db);
    const farm = await registerBusiness(db, someone.id, { name: 'Correct' });
    await asUser(db, someone.id, (tx) => tx.query('select learning.request_weekly_lesson($1)', [farm.id]));
    const { id } = (await db.query('select id from learning.lessons where learner_id = $1', [someone.id])).rows[0];

    await assert.rejects(asUser(db, reviewer.id, (tx) => tx.query('select learning.archive_lesson($1)', [id])), /decided lesson/);
    await asUser(db, reviewer.id, (tx) => tx.query(`select learning.review_lesson($1, 'approve', null)`, [id]));

    await assert.rejects(asUser(db, someone.id, (tx) => tx.query(`select learning.correct_lesson_response($1, 'x', 1, null)`, [id])), /no response to correct/);
    await asUser(db, someone.id, (tx) => tx.query(`select learning.complete_lesson($1, 'First', 3, null)`, [id]));
    await asUser(db, someone.id, (tx) => tx.query(`select learning.correct_lesson_response($1, 'Better', 5, 'Useful')`, [id]));
    const response = (await db.query('select answer, feedback_rating, feedback_text from learning.lesson_responses where lesson_id = $1', [id])).rows[0];
    assert.deepEqual(response, { answer: 'Better', feedback_rating: 5, feedback_text: 'Useful' });

    const other = await createUser(db);
    await assert.rejects(asUser(db, other.id, (tx) => tx.query(`select learning.correct_lesson_response($1, 'x', 1, null)`, [id])), /no response to correct/);

    await assert.rejects(asUser(db, someone.id, (tx) => tx.query('select learning.archive_lesson($1)', [id])), /Only a learning reviewer/);
    await asUser(db, reviewer.id, (tx) => tx.query('select learning.archive_lesson($1)', [id]));
    const gone = await asUser(db, someone.id, (tx) => tx.query('select id from learning.lessons'));
    assert.equal(gone.rows.length, 0);
  });

  test('a learner profile can be deactivated, and its status is otherwise protected (section 5)', async () => {
    const someone = await createUser(db);
    await asUser(db, someone.id, (tx) => tx.query(`insert into learning.learner_profiles (user_id, goals) values ($1, array['Costs'])`, [someone.id]));
    await assert.rejects(
      asUser(db, someone.id, (tx) => tx.query(`update learning.learner_profiles set status = 'deactivated' where user_id = $1`, [someone.id])),
      /permission denied/,
    );
    await asUser(db, someone.id, (tx) => tx.query(`select learning.set_learner_profile_status('deactivated')`));
    const { rows } = await asUser(db, someone.id, (tx) => tx.query('select status, goals from learning.learner_profiles'));
    assert.deepEqual(rows[0], { status: 'deactivated', goals: ['Costs'] });
  });
});

describe('email delivery and reminders', () => {
  let db, owner;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
  });

  const outbox = (email) => db.query('select subject, status, attempts, last_error, delivery_id from notifications.outbox where to_email = $1 order by created_at', [email]);

  test('a notification also queues an email, with its delivery tracked (FR-H01, H09)', async () => {
    const { rows } = await outbox(owner.email);
    assert.equal(rows[0].subject, 'Welcome to Verida');
    assert.equal(rows[0].status, 'pending');
    const delivery = (await db.query('select channel, status from notifications.deliveries where id = $1', [rows[0].delivery_id])).rows[0];
    assert.deepEqual(delivery, { channel: 'email', status: 'pending' });
  });

  test('someone with no account is invited by email (FR-H02)', async () => {
    const biz = await registerBusiness(db, owner.id, { name: 'Invites' });
    await asUser(db, owner.id, (tx) => tx.query(`select * from business.invite_member($1, 'newperson@example.com', 'staff')`, [biz.id]));
    const { rows } = await outbox('newperson@example.com');
    assert.equal(rows[0].subject, 'You have been invited to Verida');
  });

  test('turning email off stops optional emails, but not account messages (FR-H08)', async () => {
    const user = await createUser(db);
    await asUser(db, user.id, (tx) => tx.query('insert into notifications.preferences (user_id, email_enabled) values ($1, false)', [user.id]));
    await db.query(`select notifications.deliver($1, 'business', 'Optional', 'Body')`, [user.id]);
    await db.query(`select notifications.deliver($1, 'account', 'Required', 'Body')`, [user.id]);
    const subjects = (await outbox(user.email)).rows.map((r) => r.subject);
    assert.ok(!subjects.includes('Optional'));
    assert.ok(subjects.includes('Required'));
  });

  test('sent and failed emails update the delivery record, with retries before failing (FR-H09)', async () => {
    const user = await createUser(db);
    const claimed = (await db.query('select * from notifications.claim_outbox(500)')).rows.find((r) => r.to_email === user.email);
    assert.ok(claimed);
    const again = (await db.query('select * from notifications.claim_outbox(500)')).rows;
    assert.ok(!again.some((r) => r.id === claimed.id), 'a claimed email is not handed out twice');

    await db.query(`select notifications.complete_outbox($1, false, 'Resend 500')`, [claimed.id]);
    let row = (await outbox(user.email)).rows[0];
    assert.equal(row.status, 'pending');
    assert.equal(row.last_error, 'Resend 500');

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await db.query('select * from notifications.claim_outbox(500)');
      await db.query(`select notifications.complete_outbox($1, false, 'Resend 500')`, [claimed.id]);
    }
    row = (await outbox(user.email)).rows[0];
    assert.equal(row.status, 'failed');
    assert.equal((await db.query('select status, detail from notifications.deliveries where id = $1', [row.delivery_id])).rows[0].status, 'failed');
    const final = (await db.query('select * from notifications.claim_outbox(500)')).rows;
    assert.ok(!final.some((r) => r.id === claimed.id), 'a failed email stops being retried');
  });

  test('a successful send marks the delivery delivered', async () => {
    const user = await createUser(db);
    const claimed = (await db.query('select * from notifications.claim_outbox(500)')).rows.find((r) => r.to_email === user.email);
    await db.query('select notifications.complete_outbox($1, true)', [claimed.id]);
    const row = (await outbox(user.email)).rows[0];
    assert.equal(row.status, 'sent');
    assert.equal((await db.query('select status from notifications.deliveries where id = $1', [row.delivery_id])).rows[0].status, 'delivered');
  });

  test('clients cannot read the outbox or run the delivery functions', async () => {
    await assert.rejects(asUser(db, owner.id, (tx) => tx.query('select * from notifications.outbox')), /permission denied/);
    for (const call of ['select * from notifications.claim_outbox(1)', 'select notifications.send_learning_reminders()', `select notifications.enqueue_email('a@b.co', 's', 'b')`]) {
      await assert.rejects(asUser(db, owner.id, (tx) => tx.query(call)), /permission denied/, call);
    }
  });

  test('reminders go to unfinished lessons, once a week, respecting preferences (FR-H04)', async () => {
    const reviewer = await createUser(db);
    await grantPlatformRole(db, reviewer.id, 'learning_reviewer');
    const learner = await createUser(db);
    const biz = await registerBusiness(db, learner.id, { name: 'Remind' });
    await asUser(db, learner.id, (tx) => tx.query('select learning.request_weekly_lesson($1)', [biz.id]));
    const { id } = (await db.query('select id from learning.lessons where learner_id = $1', [learner.id])).rows[0];
    await asUser(db, reviewer.id, (tx) => tx.query(`select learning.review_lesson($1, 'approve', null)`, [id]));

    const reminders = async () => (await db.query(`select count(*)::int as n from notifications.notifications where user_id = $1 and type = 'reminder'`, [learner.id])).rows[0].n;
    await db.query('select notifications.send_learning_reminders()');
    assert.equal(await reminders(), 0, 'too soon after publication');

    await db.query(`update learning.lessons set published_at = now() - interval '4 days' where id = $1`, [id]);
    await db.query('select notifications.send_learning_reminders()');
    assert.equal(await reminders(), 1);
    await db.query('select notifications.send_learning_reminders()');
    assert.equal(await reminders(), 1, 'not repeated within a week');

    await db.query(`update notifications.notifications set created_at = now() - interval '8 days' where user_id = $1 and type = 'reminder'`, [learner.id]);
    await asUser(db, learner.id, (tx) => tx.query('insert into notifications.preferences (user_id, learning_reminders) values ($1, false)', [learner.id]));
    await db.query('select notifications.send_learning_reminders()');
    assert.equal(await reminders(), 1, 'respects the preference');
  });
});
