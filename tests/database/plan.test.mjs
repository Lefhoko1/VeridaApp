// Plan Module Developer Specification v1.0, P0: goals, milestones, progress, tasks, links,
// permissions and the calculations of section 7.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { activityTypeId, addMember, asUser, createDatabase, createUser, grantPlatformRole, recordActivity, registerBusiness } from './harness.mjs';

describe('plan', () => {
  let db, owner, staff, viewer, stranger, farm, other;

  const as = async (user, sql, params = []) => (await asUser(db, user.id, (tx) => tx.query(sql, params))).rows;
  const task = async (user, fields) => {
    const columns = ['business_id', ...Object.keys(fields)];
    const values = [fields.business_id ?? farm.id, ...Object.values(fields)];
    if (fields.business_id) {
      columns.shift();
      values.shift();
    }
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    return (await as(user, `insert into plan.tasks (${columns.join(', ')}) values (${placeholders}) returning *`, values))[0];
  };
  const goal = async (user, fields) => {
    const columns = ['business_id', ...Object.keys(fields)];
    const values = [farm.id, ...Object.values(fields)];
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    return (await as(user, `insert into plan.goals (${columns.join(', ')}) values (${placeholders}) returning *`, values))[0];
  };
  const progress = async (goalId) => (await as(owner, 'select * from plan.goal_progress($1)', [goalId]))[0];
  const setDue = (id, days) => db.query(`update plan.tasks set due_on = current_date + $2::int where id = $1`, [id, days]);

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Plan Owner' });
    staff = await createUser(db, { name: 'Plan Staff' });
    viewer = await createUser(db, { name: 'Plan Viewer' });
    stranger = await createUser(db, { name: 'Plan Stranger' });
    farm = await registerBusiness(db, owner.id, { name: 'Plan Farm', industry: 'poultry' });
    other = await registerBusiness(db, stranger.id, { name: 'Other Farm', industry: 'poultry' });
    await addMember(db, owner.id, staff, farm.id, 'staff');
    await addMember(db, owner.id, viewer, farm.id, 'viewer');
    // The farm runs on UTC here so that "today" matches the database's current_date.
    await db.query(`update business.businesses set time_zone = 'UTC' where id = $1`, [farm.id]);
  });

  test('a task needs only a title and starts not started with normal priority', async () => {
    const created = await task(owner, { title: '  Review feed use  ' });
    assert.equal(created.title, 'Review feed use');
    assert.equal(created.status, 'not_started');
    assert.equal(created.priority, 'normal');
    assert.equal(created.version, 1);
  });

  test('staff create and complete tasks, a viewer cannot, and nobody sees another business', async () => {
    const mine = await task(staff, { title: 'Clean drinkers', priority: 'high' });
    const [done] = await as(staff, `update plan.tasks set status = 'completed', completion_note = 'Done' where id = $1 returning *`, [mine.id]);
    assert.ok(done.completed_at);
    assert.equal(done.version, 2);
    await assert.rejects(task(viewer, { title: 'Not allowed' }), /row-level security/);
    assert.deepEqual(await as(stranger, 'select id from plan.tasks where business_id = $1', [farm.id]), []);
    await assert.rejects(task(owner, { business_id: other.id, title: 'Sneaky' }), /row-level security/);
  });

  test('blocking needs a reason, reopening clears completion, and only members are assigned', async () => {
    const t = await task(owner, { title: 'Order feed' });
    await assert.rejects(as(owner, `update plan.tasks set status = 'blocked' where id = $1`, [t.id]), /what is blocking/);
    await as(owner, `update plan.tasks set status = 'blocked', blocker_reason = 'Supplier closed' where id = $1`, [t.id]);
    await as(owner, `update plan.tasks set status = 'completed' where id = $1`, [t.id]);
    const [reopened] = await as(owner, `update plan.tasks set status = 'in_progress' where id = $1 returning *`, [t.id]);
    assert.equal(reopened.completed_at, null);
    assert.equal(reopened.blocker_reason, null);
    await as(owner, `update plan.tasks set assigned_to = $2 where id = $1`, [t.id, staff.id]);
    await assert.rejects(as(owner, `update plan.tasks set assigned_to = $2 where id = $1`, [t.id, stranger.id]), /member of this business/);
  });

  test('tasks and goals are never deleted', async () => {
    const t = await task(owner, { title: 'Keep me' });
    await assert.rejects(as(owner, 'delete from plan.tasks where id = $1', [t.id]), /permission denied/);
  });

  test('a measurable goal needs a direction and target; owners create goals and staff cannot', async () => {
    await assert.rejects(goal(owner, { title: 'Grow', goal_type: 'measurable' }), /check constraint/);
    await assert.rejects(goal(staff, { title: 'Grow', goal_type: 'milestone' }), /row-level security/);
    await assert.rejects(goal(owner, { title: 'Grow', goal_type: 'measurable', direction: 'increase', baseline_value: 5, target_value: 5 }), /must differ/);
    const g = await goal(owner, { title: 'Sell more trays', goal_type: 'measurable', direction: 'increase', baseline_value: 300, target_value: 450, unit: 'trays' });
    await assert.rejects(as(owner, `update plan.goals set status = 'cancelled' where id = $1`, [g.id]), /why the goal is cancelled/);
  });

  test('increase and decrease progress follow section 7, and passing the target shows above 100', async () => {
    const up = await goal(owner, { title: 'Up', goal_type: 'measurable', direction: 'increase', baseline_value: 300, target_value: 450 });
    assert.equal((await progress(up.id)).progress_status, 'no_data');
    await as(owner, `insert into plan.goal_progress (business_id, goal_id, recorded_on, actual_value) values ($1, $2, current_date - 1, 360)`, [farm.id, up.id]);
    let p = await progress(up.id);
    assert.equal(Number(p.percent), 40);
    assert.equal(p.source, 'manual');
    await as(owner, `insert into plan.goal_progress (business_id, goal_id, recorded_on, actual_value) values ($1, $2, current_date, 480)`, [farm.id, up.id]);
    p = await progress(up.id);
    assert.equal(Number(p.percent), 120);
    assert.equal(p.progress_status, 'target_met');
    assert.match(p.note, /passed/);

    const down = await goal(owner, { title: 'Down', goal_type: 'measurable', direction: 'decrease', baseline_value: 50, target_value: 30 });
    await as(owner, `insert into plan.goal_progress (business_id, goal_id, recorded_on, actual_value) values ($1, $2, current_date, 45)`, [farm.id, down.id]);
    assert.equal(Number((await progress(down.id)).percent), 25);
  });

  test('without a baseline there is no percentage, and maintain and threshold use their own rules', async () => {
    const noBase = await goal(owner, { title: 'No base', goal_type: 'measurable', direction: 'increase', target_value: 10 });
    await as(owner, `insert into plan.goal_progress (business_id, goal_id, recorded_on, actual_value) values ($1, $2, current_date, 5)`, [farm.id, noBase.id]);
    const p = await progress(noBase.id);
    assert.equal(p.percent, null);
    assert.equal(p.progress_status, 'percent_unavailable');

    const keep = await goal(owner, { title: 'Keep', goal_type: 'measurable', direction: 'maintain', target_value: 80, tolerance: 5 });
    await as(owner, `insert into plan.goal_progress (business_id, goal_id, recorded_on, actual_value) values ($1, $2, current_date, 77)`, [farm.id, keep.id]);
    assert.equal((await progress(keep.id)).progress_status, 'on_track');

    const floor = await goal(owner, { title: 'Floor', goal_type: 'measurable', direction: 'threshold', target_value: 100 });
    await as(owner, `insert into plan.goal_progress (business_id, goal_id, recorded_on, actual_value) values ($1, $2, current_date, 90)`, [farm.id, floor.id]);
    const f = await progress(floor.id);
    assert.equal(f.progress_status, 'below_threshold');
    assert.equal(f.percent, null);
  });

  test('a goal can follow a measure from the analytics service', async () => {
    const eggs = await goal(owner, { title: 'More eggs', goal_type: 'measurable', direction: 'increase', baseline_value: 0, target_value: 200, kpi_code: 'eggs_collected' });
    const typeId = await activityTypeId(db, 'poultry', 'eggs_collected');
    await asUser(db, owner.id, (tx) => recordActivity(tx, farm.id, typeId, new Date().toISOString().slice(0, 10), 50, { unit: 'eggs' }));
    const p = await progress(eggs.id);
    assert.equal(p.source, 'kpi');
    assert.equal(Number(p.actual), 50);
    assert.equal(Number(p.percent), 25);
  });

  test('a milestone goal reports milestones, never a made-up percentage', async () => {
    const g = await goal(owner, { title: 'Open a second house', goal_type: 'milestone' });
    assert.equal((await progress(g.id)).progress_status, 'no_milestones');
    const [m1] = await as(owner, `insert into plan.goal_milestones (business_id, goal_id, title) values ($1, $2, 'Get quotes') returning *`, [farm.id, g.id]);
    await as(owner, `insert into plan.goal_milestones (business_id, goal_id, title) values ($1, $2, 'Build')`, [farm.id, g.id]);
    const [done] = await as(owner, `update plan.goal_milestones set status = 'completed' where id = $1 returning completed_at`, [m1.id]);
    assert.ok(done.completed_at);
    const p = await progress(g.id);
    assert.equal(p.percent, null);
    assert.equal(p.milestones_done, 1);
    assert.equal(p.milestones_total, 2);
    await assert.rejects(goal(owner, { title: 'Bad', goal_type: 'milestone', target_value: 3 }), /check constraint/);
  });

  test('a task links to several goals, only within its business', async () => {
    const t = await task(staff, { title: 'Weigh feed' });
    const [g1] = await as(owner, `select id from plan.goals where business_id = $1 limit 2`, [farm.id]);
    const goals = await as(owner, `select id from plan.goals where business_id = $1 order by created_at limit 2`, [farm.id]);
    for (const g of goals) await as(staff, 'insert into plan.task_goals (task_id, goal_id, business_id) values ($1, $2, $3)', [t.id, g.id, farm.id]);
    assert.equal((await as(owner, 'select count(*)::int as n from plan.task_goals where task_id = $1', [t.id]))[0].n, 2);
    await assert.rejects(as(staff, 'insert into plan.task_goals (task_id, goal_id, business_id) values ($1, $2, $3)', [t.id, g1.id, farm.id]), /duplicate key/);
    const strangerTask = await task(stranger, { business_id: other.id, title: 'Theirs' });
    await assert.rejects(as(stranger, 'insert into plan.task_goals (task_id, goal_id, business_id) values ($1, $2, $3)', [strangerTask.id, g1.id, other.id]), /foreign key/);
  });

  test('the overview counts open, overdue and due tasks, and the section 7 rates', async () => {
    const fresh = await registerBusiness(db, owner.id, { name: 'Counting Farm', industry: 'poultry' });
    await db.query(`update business.businesses set time_zone = 'UTC' where id = $1`, [fresh.id]);
    const make = (title, fields = {}) => task(owner, { business_id: fresh.id, title, ...fields });
    const late = await make('Late');
    await setDue(late.id, -2);
    const today = await make('Today');
    await setDue(today.id, 0);
    const onTime = await make('Done on time');
    await setDue(onTime.id, 1);
    await as(owner, `update plan.tasks set status = 'completed' where id = $1`, [onTime.id]);
    const lateDone = await make('Done late');
    await setDue(lateDone.id, -1);
    await as(owner, `update plan.tasks set status = 'completed' where id = $1`, [lateDone.id]);
    const cancelled = await make('Dropped');
    await setDue(cancelled.id, 0);
    await as(owner, `update plan.tasks set status = 'cancelled' where id = $1`, [cancelled.id]);

    const [o] = await as(owner, `select * from plan.overview($1, current_date - 7, current_date + 7)`, [fresh.id]);
    assert.equal(o.open_tasks, 2);
    assert.equal(o.overdue_tasks, 1);
    assert.equal(o.due_today, 1);
    assert.equal(o.completed_in_period, 2);
    // Four tasks due in the period, the cancelled one left out; two completed.
    assert.equal(o.eligible_due, 4);
    assert.equal(Number(o.completion_rate), 50);
    // One of the two completed tasks was finished by its due date.
    assert.equal(Number(o.on_time_rate), 50);
    await assert.rejects(as(stranger, `select * from plan.overview($1, current_date, current_date)`, [fresh.id]));
  });

  test('erasing a business with linked activities works', async () => {
    const admin = await createUser(db, { name: 'Plan Admin' });
    await grantPlatformRole(db, admin.id, 'administrator');
    const doomed = await registerBusiness(db, stranger.id, { name: 'Doomed Farm', industry: 'poultry' });
    const [sale] = await as(stranger, `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
                                       values ($1, current_date, 'Eggs', 'Egg sales', 1, 5) returning id`, [doomed.id]);
    const typeId = await activityTypeId(db, 'poultry', 'eggs_collected');
    await as(stranger, `insert into operations.activity_records (business_id, activity_type_id, occurred_on, quantity, unit, sale_id)
                        values ($1, $2, current_date, 5, 'eggs', $3)`, [doomed.id, typeId, sale.id]);
    await task(stranger, { business_id: doomed.id, title: 'Doomed task' });
    await as(admin, 'select platform.admin_set_retention(0)');
    await as(stranger, `select business.set_business_status($1, 'deletion_requested')`, [doomed.id]);
    await as(admin, 'select business.admin_erase_business($1)', [doomed.id]);
    await as(admin, 'select platform.admin_set_retention(90)');
    assert.equal((await db.query('select count(*)::int as n from plan.tasks where business_id = $1', [doomed.id])).rows[0].n, 0);
  });
});
