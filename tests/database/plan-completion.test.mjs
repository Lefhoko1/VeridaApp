// Plan Module Developer Specification v1.0: suggestions and their approval (P2), offline capture
// time, links to records, related measures, repeating events, settings and retention.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { addMember, asUser, createDatabase, createUser, registerBusiness } from './harness.mjs';

describe('plan completion', () => {
  let db, owner, staff, viewer, stranger, farm, other;

  const as = async (user, sql, params = []) => (await asUser(db, user.id, (tx) => tx.query(sql, params))).rows;
  const one = async (user, sql, params = []) => (await as(user, sql, params))[0];
  const today = async () => (await db.query('select current_date::text as d')).rows[0].d;
  const plus = async (days) => (await db.query('select (current_date + $1::int)::text as d', [days])).rows[0].d;
  const task = (user, title, extra = '') => one(user, `insert into plan.tasks (business_id, title${extra ? ', due_on' : ''}) values ($1, $2${extra ? ', $3' : ''}) returning *`, extra ? [farm.id, title, extra] : [farm.id, title]);
  const goal = (user, title) => one(user, `insert into plan.goals (business_id, title, goal_type) values ($1, $2, 'milestone') returning *`, [farm.id, title]);
  // The AI service stores suggestions with the service key, which these tests stand in for.
  const store = (actions, { kind = 'weekly_plan', goalId = null, user = owner, business = farm } = {}) =>
    db
      .query(
        `select plan.store_recommendation($1, $2, $3, $4, null, 'Plan for the week', 'Because of your plan.', 'You work weekdays.', 'Sales data covers 30 days.',
                '[{"type":"goal","ref":"g","label":"Goal"}]', current_date, current_date + 6, 'ai', 'claude-opus-5-5', $5::jsonb) as id`,
        [business.id, user.id, kind, goalId, JSON.stringify(actions)],
      )
      .then((result) => result.rows[0].id);
  const actionsOf = async (recommendationId) =>
    (await db.query('select * from plan.recommendation_actions where recommendation_id = $1 order by sort_order', [recommendationId])).rows;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Completion Owner' });
    staff = await createUser(db, { name: 'Completion Staff' });
    viewer = await createUser(db, { name: 'Completion Viewer' });
    stranger = await createUser(db, { name: 'Completion Stranger' });
    farm = await registerBusiness(db, owner.id, { name: 'Completion Farm', industry: 'poultry' });
    other = await registerBusiness(db, stranger.id, { name: 'Other Farm', industry: 'poultry' });
    await addMember(db, owner.id, staff, farm.id, 'staff');
    await addMember(db, owner.id, viewer, farm.id, 'viewer');
    await db.query(`update business.businesses set time_zone = 'UTC' where id in ($1, $2)`, [farm.id, other.id]);
  });

  describe('suggestions from Verida (section 4.6)', () => {
    test('no client can write a suggestion, and everyone in the business can read one', async () => {
      await assert.rejects(
        as(owner, `insert into plan.recommendations (business_id, kind, title, explanation, generator) values ($1, 'weekly_plan', 'x', 'y', 'ai')`, [farm.id]),
        /permission denied/,
      );
      await assert.rejects(as(owner, `select plan.store_recommendation($1, $2, 'weekly_plan', null, null, 't', 'e', null, null, '[]', null, null, 'ai', null, '[]')`, [farm.id, owner.id]), /permission denied/);
      const id = await store([{ type: 'create_task', why: 'Keeps eggs moving', payload: { title: 'Call two buyers', due_on: await plus(1) } }]);
      assert.equal((await as(viewer, 'select id from plan.recommendations where id = $1', [id])).length, 1);
      assert.deepEqual(await as(stranger, 'select id from plan.recommendations where id = $1', [id]), []);
    });

    test('a suggestion is refused if it names another business, a past date or a field it may not set', async () => {
      const foreign = await one(stranger, `insert into plan.goals (business_id, title, goal_type) values ($1, 'Theirs', 'milestone') returning id`, [other.id]);
      await assert.rejects(store([{ type: 'create_task', payload: { title: 'x', goal_ids: [foreign.id] } }]), /outside this business/);
      await assert.rejects(store([{ type: 'create_task', payload: { title: 'x', due_on: await plus(-1) } }]), /already passed/);
      await assert.rejects(store([{ type: 'create_task', payload: { title: 'x', assigned_to: staff.id } }]), /may not set/);
      await assert.rejects(store([{ type: 'run_sql', payload: {} }]), /not valid/);
      await assert.rejects(store([{ type: 'create_task', payload: { title: 'x' } }], { user: stranger }), /member of the business/);
    });

    test('accepting creates the task with its goal and keeps the link back to the suggestion', async () => {
      const g = await goal(owner, 'Sell 450 trays');
      const id = await store([
        { type: 'create_task', why: 'Buyers first', payload: { title: 'Call two buyers', priority: 'high', due_on: await plus(2), goal_ids: [g.id] } },
        { type: 'create_milestone', payload: { goal_id: g.id, title: 'First buyer signed' } },
      ]);
      const [first, second] = await actionsOf(id);
      const [{ accept_action: taskId }] = await as(staff, 'select plan.accept_action($1)', [first.id]);
      const created = await one(owner, 'select * from plan.tasks where id = $1', [taskId]);
      assert.equal(created.title, 'Call two buyers');
      assert.equal(created.priority, 'high');
      assert.equal(created.assigned_to, null, 'Verida never assigns work');
      assert.equal(created.created_by, staff.id);
      assert.deepEqual((await as(owner, 'select goal_id from plan.task_goals where task_id = $1', [taskId])).map((r) => r.goal_id), [g.id]);
      const accepted = (await actionsOf(id))[0];
      assert.equal(accepted.approval_status, 'accepted');
      assert.equal(accepted.created_task_id, taskId);
      assert.equal(accepted.decided_by, staff.id);

      await assert.rejects(as(staff, 'select plan.accept_action($1)', [second.id]), /permission/i, 'staff cannot add milestones');
      await as(owner, 'select plan.accept_action($1)', [second.id]);
      assert.equal((await one(owner, 'select status from plan.recommendations where id = $1', [id])).status, 'decided');
      await assert.rejects(as(owner, 'select plan.accept_action($1)', [first.id]), /already been decided/);
    });

    test('a person can edit before accepting, but only the fields the action allows', async () => {
      const id = await store([{ type: 'create_task', payload: { title: 'Order feed', due_on: await plus(1) } }]);
      const [action] = await actionsOf(id);
      await assert.rejects(as(owner, `select plan.accept_action($1, '{"assigned_to": "x"}')`, [action.id]), /may not set/);
      const [{ accept_action: taskId }] = await as(owner, `select plan.accept_action($1, $2::jsonb)`, [action.id, JSON.stringify({ title: 'Order 20 bags of feed', due_on: await plus(3) })]);
      const created = await one(owner, 'select title, due_on::text from plan.tasks where id = $1', [taskId]);
      assert.deepEqual(created, { title: 'Order 20 bags of feed', due_on: await plus(3) });
      assert.equal((await actionsOf(id))[0].approval_status, 'edited');
    });

    test('a suggested reschedule never changes a task someone has changed since', async () => {
      const t = await task(owner, 'Fix the fence', await plus(0));
      const id = await store([{ type: 'update_task', why: 'Clashes with the delivery', payload: { task_id: t.id, due_on: await plus(4) } }]);
      const [action] = await actionsOf(id);
      assert.equal(action.proposed_payload.expected_version, 1);
      assert.equal(action.proposed_payload.task_title, 'Fix the fence');
      await as(staff, `update plan.tasks set priority = 'high' where id = $1`, [t.id]);
      await assert.rejects(as(owner, 'select plan.accept_action($1)', [action.id]), /changed since/);
      assert.equal((await one(owner, 'select due_on::text from plan.tasks where id = $1', [t.id])).due_on, await plus(0), 'nothing moved silently');

      const fresh = await store([{ type: 'update_task', payload: { task_id: t.id, due_on: await plus(4) } }]);
      await as(owner, 'select plan.accept_action($1)', [(await actionsOf(fresh))[0].id]);
      assert.equal((await one(owner, 'select due_on::text from plan.tasks where id = $1', [t.id])).due_on, await plus(4));
    });

    test('asking again replaces the open suggestion, and a replaced one cannot be accepted', async () => {
      const first = await store([{ type: 'create_task', payload: { title: 'A' } }], { kind: 'insight_actions' });
      const second = await store([{ type: 'create_task', payload: { title: 'B' } }], { kind: 'insight_actions' });
      assert.equal((await one(owner, 'select status from plan.recommendations where id = $1', [first])).status, 'superseded');
      await assert.rejects(as(owner, 'select plan.accept_action($1)', [(await actionsOf(first))[0].id]), /replaced/);
      await as(staff, 'select plan.dismiss_recommendation($1)', [second]);
      assert.equal((await one(owner, 'select status from plan.recommendations where id = $1', [second])).status, 'dismissed');
      assert.equal((await actionsOf(second))[0].approval_status, 'dismissed');
      await assert.rejects(as(viewer, 'select plan.dismiss_recommendation($1)', [first]), /permission/i);
    });

    test('built-in rules suggest from the plan itself, and say where each comes from', async () => {
      const late = await task(owner, 'Pay the vet', await plus(-3));
      const idle = await goal(owner, 'Open a farm shop');
      const [{ suggest_from_rules: id }] = await as(staff, `select plan.suggest_from_rules($1, 'weekly_plan')`, [farm.id]);
      const rec = await one(owner, 'select * from plan.recommendations where id = $1', [id]);
      assert.equal(rec.generator, 'rules');
      assert.equal(rec.requested_by, staff.id);
      const actions = await actionsOf(id);
      const reschedule = actions.find((a) => a.action_type === 'update_task' && a.proposed_payload.task_id === late.id);
      assert.ok(reschedule, 'the overdue task is proposed for a new date');
      assert.match(reschedule.why, /Overdue since/);
      assert.ok(actions.some((a) => a.action_type === 'create_task' && (a.proposed_payload.goal_ids ?? []).includes(idle.id)));
      assert.ok(rec.sources.some((s) => s.ref === late.id));

      const [{ suggest_from_rules: steps }] = await as(owner, `select plan.suggest_from_rules($1, 'goal_breakdown', $2)`, [farm.id, idle.id]);
      assert.ok((await actionsOf(steps)).some((a) => a.action_type === 'create_milestone'));
      await assert.rejects(as(viewer, `select plan.suggest_from_rules($1, 'weekly_plan')`, [farm.id]), /permission/i);
      assert.equal((await one(owner, 'select plan.assistant_context_allowed($1) as ok', [farm.id])).ok, true);
      assert.equal((await one(viewer, 'select plan.assistant_context_allowed($1) as ok', [farm.id])).ok, false);
    });

    test('suggestions nobody acted on are removed after 90 days; ones that made a record stay', async () => {
      const unused = await store([{ type: 'create_task', payload: { title: 'Old idea' } }], { kind: 'request' });
      await db.query(`update plan.recommendations set generated_at = now() - interval '91 days' where id = $1`, [unused]);
      const used = await store([{ type: 'create_task', payload: { title: 'Old but used' } }], { kind: 'goal_breakdown' });
      await as(owner, 'select plan.accept_action($1)', [(await actionsOf(used))[0].id]);
      await db.query(`update plan.recommendations set generated_at = now() - interval '91 days' where id = $1`, [used]);
      await db.query('select plan.purge_old_recommendations()');
      assert.equal((await db.query('select id from plan.recommendations where id = any($1)', [[unused, used]])).rows.map((r) => r.id).join(), used);
      await assert.rejects(as(owner, 'select plan.purge_old_recommendations()'), /permission denied/);
      await assert.rejects(as(owner, 'select plan.weekly_rule_suggestions()'), /permission denied/);
    });
  });

  describe('settings, links and measures', () => {
    test('owners decide whether staff can be given tasks', async () => {
      await assert.rejects(as(staff, `select plan.save_settings($1, false, true, '07:30')`, [farm.id]), /permission/i);
      await as(owner, `select plan.save_settings($1, false, true, '07:30')`, [farm.id]);
      assert.deepEqual(await one(viewer, 'select * from plan.settings_for($1)', [farm.id]), { allow_staff_assignment: false, weekly_suggestions: true, default_reminder_time: '07:30:00' });
      await assert.rejects(one(owner, 'insert into plan.tasks (business_id, title, assigned_to) values ($1, $2, $3)', [farm.id, 'For staff', staff.id]), /may be given tasks/);
      await one(owner, 'insert into plan.tasks (business_id, title, assigned_to) values ($1, $2, $3) returning id', [farm.id, 'For me', owner.id]);
      assert.equal((await db.query('select plan.weekly_rule_suggestions() as n')).rows[0].n >= 0, true);
      await as(owner, `select plan.save_settings($1, true, false, '08:00')`, [farm.id]);
    });

    test('a task links only to records of its own business, and a viewer cannot link', async () => {
      const t = await task(owner, 'Chase payment');
      const [sale] = await as(owner, `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price) values ($1, current_date, 'Eggs', 'Egg sales', 2, 40) returning id`, [farm.id]);
      const [theirs] = await as(stranger, `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price) values ($1, current_date, 'Eggs', 'Egg sales', 1, 40) returning id`, [other.id]);
      await one(staff, `insert into plan.task_links (business_id, task_id, link_type, record_id, label) values ($1, $2, 'sale', $3, 'Eggs') returning id`, [farm.id, t.id, sale.id]);
      await assert.rejects(as(staff, `insert into plan.task_links (business_id, task_id, link_type, record_id, label) values ($1, $2, 'sale', $3, 'Eggs')`, [farm.id, t.id, theirs.id]), /same business/);
      await assert.rejects(as(staff, `insert into plan.task_links (business_id, task_id, link_type, record_id, label) values ($1, $2, 'sale', $3, 'Eggs')`, [farm.id, t.id, sale.id]), /duplicate key/);
      await one(staff, `insert into plan.task_links (business_id, task_id, link_type, kpi_code, label) values ($1, $2, 'kpi', 'revenue', 'Revenue') returning id`, [farm.id, t.id]);
      await assert.rejects(as(viewer, `insert into plan.task_links (business_id, task_id, link_type, kpi_code, label) values ($1, $2, 'kpi', 'revenue', 'Revenue')`, [farm.id, t.id]), /row-level security/);
      assert.equal((await as(viewer, 'select id from plan.task_links where task_id = $1', [t.id])).length, 2);
    });

    test('a goal can relate to several measures, each with its period and status from the analytics service', async () => {
      const g = await goal(owner, 'Grow income');
      await as(owner, `insert into plan.goal_kpis (goal_id, business_id, kpi_code) values ($1, $2, 'revenue'), ($1, $2, 'expenses')`, [g.id, farm.id]);
      const measures = await as(viewer, 'select * from plan.goal_measures($1)', [g.id]);
      assert.deepEqual(measures.map((m) => m.code).sort(), ['expenses', 'revenue']);
      assert.ok(measures.every((m) => m.status && m.period_to));
      await assert.rejects(as(staff, `insert into plan.goal_kpis (goal_id, business_id, kpi_code) values ($1, $2, 'gross_profit')`, [g.id, farm.id]), /row-level security/);
    });

    test('a task keeps the time it was captured offline, and nobody can change it later', async () => {
      const captured = new Date(Date.now() - 3 * 3600_000).toISOString();
      const t = await one(staff, `insert into plan.tasks (business_id, title, client_id, client_recorded_at) values ($1, 'Captured offline', gen_random_uuid(), $2) returning *`, [farm.id, captured]);
      assert.equal(new Date(t.client_recorded_at).toISOString(), captured);
      await assert.rejects(as(staff, `update plan.tasks set client_recorded_at = now() where id = $1`, [t.id]), /permission denied/);
    });
  });

  describe('repeating events (section 4.4)', () => {
    test('an event series makes one event per date, shows later ones as projected, and never twice', async () => {
      const [rule] = await as(staff, `insert into plan.recurring_rules (business_id, title, kind, event_type, start_time, end_time, frequency, starts_on)
                                      values ($1, 'Market day', 'event', 'delivery', '08:00', '12:00', 'daily', current_date) returning *`, [farm.id]);
      const made = (await db.query('select occurrence_on::text from plan.events where rule_id = $1 order by occurrence_on', [rule.id])).rows;
      assert.equal(made.length, 8);
      const items = await as(viewer, 'select kind, on_date::text as on, start_time::text from plan.schedule($1, current_date, current_date + 20) where rule_id = $2', [farm.id, rule.id]);
      assert.equal(items.length, 21);
      assert.equal(new Set(items.map((i) => i.on)).size, 21);
      assert.ok(items.every((i) => i.start_time === '08:00:00'));

      const [second] = (await db.query('select id from plan.events where rule_id = $1 order by occurrence_on offset 1 limit 1', [rule.id])).rows;
      await as(staff, `update plan.events set start_time = '09:00' where id = $1`, [second.id]);
      await as(owner, `update plan.recurring_rules set title = 'Market day in town' where id = $1`, [rule.id]);
      const after = (await db.query('select id, title, detached from plan.events where rule_id = $1 order by occurrence_on', [rule.id])).rows;
      assert.equal(after.find((e) => e.id === second.id).title, 'Market day', 'an occurrence changed on its own keeps its change');
      assert.ok(after.filter((e) => e.id !== second.id).every((e) => e.title === 'Market day in town'));

      await as(owner, `update plan.recurring_rules set status = 'ended' where id = $1`, [rule.id]);
      const ended = (await db.query(`select status from plan.events where rule_id = $1 and occurrence_on > current_date and not detached`, [rule.id])).rows;
      assert.ok(ended.every((e) => e.status === 'cancelled'));
      assert.equal(await today(), (await db.query('select current_date::text as d')).rows[0].d);
    });

    test('an event series needs a kind of event and cannot be assigned', async () => {
      await assert.rejects(as(owner, `insert into plan.recurring_rules (business_id, title, kind, frequency, starts_on) values ($1, 'X', 'event', 'daily', current_date)`, [farm.id]), /check constraint/);
      await assert.rejects(
        as(owner, `insert into plan.recurring_rules (business_id, title, kind, event_type, assigned_to, frequency, starts_on) values ($1, 'X', 'event', 'other', $2, 'daily', current_date)`, [farm.id, owner.id]),
        /check constraint/,
      );
    });
  });
});
