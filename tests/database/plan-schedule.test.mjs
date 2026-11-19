// Plan Module Developer Specification v1.0, P1: events, repeating tasks, reminders, comments,
// task history and weekly reviews.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { addMember, asUser, createDatabase, createUser, registerBusiness } from './harness.mjs';

describe('plan schedule and collaboration', () => {
  let db, owner, staff, viewer, stranger, farm;

  const as = async (user, sql, params = []) => (await asUser(db, user.id, (tx) => tx.query(sql, params))).rows;
  const today = async () => (await db.query('select current_date::text as d')).rows[0].d;
  const plus = async (days) => (await db.query('select (current_date + $1::int)::text as d', [days])).rows[0].d;
  const rule = async (user, fields) => {
    const columns = ['business_id', ...Object.keys(fields)];
    const values = [farm.id, ...Object.values(fields)];
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    return (await as(user, `insert into plan.recurring_rules (${columns.join(', ')}) values (${placeholders}) returning *`, values))[0];
  };
  const occurrences = async (ruleId) =>
    (await db.query('select id, occurrence_on::text as on, title, status, detached from plan.tasks where rule_id = $1 order by occurrence_on', [ruleId])).rows;
  const task = async (user, title) => (await as(user, 'insert into plan.tasks (business_id, title) values ($1, $2) returning *', [farm.id, title]))[0];

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Schedule Owner' });
    staff = await createUser(db, { name: 'Schedule Staff' });
    viewer = await createUser(db, { name: 'Schedule Viewer' });
    stranger = await createUser(db, { name: 'Schedule Stranger' });
    farm = await registerBusiness(db, owner.id, { name: 'Schedule Farm', industry: 'poultry' });
    await registerBusiness(db, stranger.id, { name: 'Elsewhere', industry: 'poultry' });
    await addMember(db, owner.id, staff, farm.id, 'staff');
    await addMember(db, owner.id, viewer, farm.id, 'viewer');
    await db.query(`update business.businesses set time_zone = 'UTC' where id = $1`, [farm.id]);
  });

  describe('repeating tasks', () => {
    test('a daily series creates one task per day up to a week ahead, and never twice', async () => {
      const series = await rule(staff, { title: 'Collect eggs', frequency: 'daily', starts_on: await today() });
      const first = await occurrences(series.id);
      assert.equal(first.length, 8);
      assert.equal(first[0].on, await today());
      assert.equal(first[7].on, await plus(7));

      const [{ generate_occurrences: again }] = await as(viewer, 'select plan.generate_occurrences($1)', [farm.id]);
      assert.equal(again, 0);
      assert.equal((await occurrences(series.id)).length, 8);
    });

    test('a back-dated series does not fill the list with overdue work', async () => {
      const series = await rule(owner, { title: 'Weigh birds', frequency: 'daily', starts_on: await plus(-20) });
      assert.equal((await occurrences(series.id))[0].on, await today());
    });

    test('weekly series fall on the chosen weekdays, every other week when asked', async () => {
      const start = '2026-01-05'; // a Monday
      const [{ dates }] = (
        await db.query(
          `select array_agg(d::text order by d) as dates
             from plan.rule_dates(jsonb_populate_record(null::plan.recurring_rules,
                                    jsonb_build_object('frequency', 'weekly', 'interval_count', 2, 'days_of_week', array[1, 4], 'starts_on', $1::date)),
                                  $1::date, '2026-02-01'::date) d`,
          [start],
        )
      ).rows;
      assert.deepEqual(dates, ['2026-01-05', '2026-01-08', '2026-01-19', '2026-01-22']);
    });

    test('a monthly series on the 31st uses the last day of shorter months', async () => {
      const [{ dates }] = (
        await db.query(
          `select array_agg(d::text order by d) as dates
             from plan.rule_dates(jsonb_populate_record(null::plan.recurring_rules,
                                    jsonb_build_object('frequency', 'monthly', 'interval_count', 1, 'day_of_month', 31, 'starts_on', '2026-01-31')),
                                  '2026-01-01'::date, '2026-04-30'::date) d`,
        )
      ).rows;
      assert.deepEqual(dates, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    });

    test('the schedule shows later occurrences as projected, never alongside their task', async () => {
      const series = await rule(owner, { title: 'Clean house', frequency: 'weekly', days_of_week: [1, 2, 3, 4, 5, 6, 7], starts_on: await today() });
      const rows = await as(viewer, 'select kind, on_date::text as on from plan.schedule($1, $2, $3) where rule_id = $4', [farm.id, await today(), await plus(20), series.id]);
      assert.equal(rows.length, 21);
      assert.equal(new Set(rows.map((row) => row.on)).size, 21);
      assert.equal(rows.filter((row) => row.kind === 'task').length, 8);
      assert.equal(rows.filter((row) => row.kind === 'projected').length, 13);
    });

    test('editing the series changes untouched future occurrences only; ending it cancels the rest', async () => {
      const series = await rule(owner, { title: 'Check water', frequency: 'daily', starts_on: await today() });
      const [, edited, completed] = await occurrences(series.id);
      await as(staff, `update plan.tasks set title = 'Check water and drinkers' where id = $1`, [edited.id]);
      await as(staff, `update plan.tasks set status = 'completed' where id = $1`, [completed.id]);

      await as(owner, `update plan.recurring_rules set title = 'Check water lines', priority = 'high' where id = $1`, [series.id]);
      const after = await occurrences(series.id);
      assert.equal(after.find((o) => o.id === edited.id).title, 'Check water and drinkers');
      assert.equal(after.find((o) => o.id === edited.id).detached, true);
      assert.equal(after.find((o) => o.id === completed.id).title, 'Check water');
      assert.ok(after.filter((o) => o.id !== edited.id && o.id !== completed.id).every((o) => o.title === 'Check water lines'));

      await as(owner, `update plan.recurring_rules set status = 'ended' where id = $1`, [series.id]);
      const ended = await occurrences(series.id);
      assert.equal(ended[0].status, 'not_started', "today's occurrence stays");
      assert.equal(ended.find((o) => o.id === completed.id).status, 'completed');
      assert.equal(ended.find((o) => o.id === edited.id).status, 'not_started');
      assert.ok(ended.filter((o) => o.on > ended[0].on && o.id !== edited.id && o.id !== completed.id).every((o) => o.status === 'cancelled'));
    });

    test('a pattern cannot change, a client cannot fake an occurrence, and a viewer cannot start a series', async () => {
      const series = await rule(owner, { title: 'Feed', frequency: 'daily', starts_on: await today() });
      await assert.rejects(as(owner, `update plan.recurring_rules set frequency = 'weekly' where id = $1`, [series.id]), /permission denied/);
      await assert.rejects(
        as(owner, 'insert into plan.tasks (business_id, title, rule_id, occurrence_on) values ($1, $2, $3, $4)', [farm.id, 'Fake', series.id, await plus(30)]),
        /permission denied/,
      );
      await assert.rejects(rule(viewer, { title: 'No', frequency: 'daily', starts_on: await today() }), /row-level security/);
      assert.deepEqual(await as(stranger, 'select id from plan.recurring_rules where business_id = $1', [farm.id]), []);
      await assert.rejects(as(stranger, 'select plan.generate_occurrences($1)', [farm.id]), /permission/i);
    });

    test('a weekly series needs days and a monthly one a day of the month', async () => {
      await assert.rejects(rule(owner, { title: 'W', frequency: 'weekly', starts_on: await today() }), /check constraint/);
      await assert.rejects(rule(owner, { title: 'M', frequency: 'monthly', starts_on: await today() }), /check constraint/);
    });
  });

  describe('events', () => {
    test('staff schedule events, viewers see them, and times must make sense', async () => {
      const [event] = await as(staff, `insert into plan.events (business_id, title, event_type, starts_on, start_time, end_time) values ($1, 'Feed delivery', 'delivery', $2, '09:00', '10:00') returning *`, [
        farm.id,
        await plus(2),
      ]);
      assert.equal(event.status, 'scheduled');
      const rows = await as(viewer, 'select kind, title from plan.schedule($1, $2, $3) where kind = $4', [farm.id, await today(), await plus(5), 'event']);
      assert.deepEqual(rows.map((row) => row.title), ['Feed delivery']);
      await assert.rejects(as(viewer, `insert into plan.events (business_id, title, starts_on) values ($1, 'No', current_date)`, [farm.id]), /row-level security/);
      await assert.rejects(as(owner, `insert into plan.events (business_id, title, starts_on, start_time, end_time) values ($1, 'Bad', current_date, '10:00', '09:00')`, [farm.id]), /check constraint/);
      await assert.rejects(as(stranger, 'select * from plan.schedule($1, current_date, current_date)', [farm.id]), /permission/i);
    });

    test('the schedule refuses long periods', async () => {
      await assert.rejects(as(owner, 'select * from plan.schedule($1, current_date, current_date + 90)', [farm.id]), /two months/);
    });
  });

  describe('reminders', () => {
    const due = (id) => db.query(`update plan.task_reminders set remind_at = now() - interval '1 minute' where id = $1`, [id]);
    const status = async (id) => (await db.query('select status from plan.task_reminders where id = $1', [id])).rows[0].status;
    const sendAll = async () => (await db.query('select plan.send_due_reminders() as n')).rows[0].n;
    const inbox = async (user) => (await db.query(`select title from notifications.notifications where user_id = $1 and type = 'task'`, [user.id])).rows;

    test('a reminder is sent once, in the app, to the person who set it', async () => {
      const t = await task(staff, 'Order vaccines');
      const [{ set_reminder: id }] = await as(staff, `select plan.set_reminder($1, current_date + 1, '08:00')`, [t.id]);
      await due(id);
      assert.equal(await sendAll(), 1);
      assert.equal(await sendAll(), 0);
      assert.equal(await status(id), 'sent');
      assert.deepEqual((await inbox(staff)).map((n) => n.title), ['Reminder: Order vaccines']);
      assert.deepEqual(await as(owner, 'select id from plan.task_reminders where id = $1', [id]), [], 'reminders are private');
    });

    test('snoozing and dismissing leave the due date alone', async () => {
      const [t] = await as(owner, `insert into plan.tasks (business_id, title, due_on) values ($1, 'Pay rent', current_date + 3) returning *`, [farm.id]);
      const [{ set_reminder: id }] = await as(owner, `select plan.set_reminder($1, current_date + 1, '07:30')`, [t.id]);
      await as(owner, 'select plan.snooze_reminder($1, 60)', [id]);
      assert.equal(await status(id), 'pending');
      await as(owner, 'select plan.dismiss_reminder($1)', [id]);
      assert.equal(await status(id), 'dismissed');
      const [after] = (await db.query('select due_on, version from plan.tasks where id = $1', [t.id])).rows;
      assert.equal(after.version, 1);
      await assert.rejects(as(staff, 'select plan.dismiss_reminder($1)', [id]), /could not be found/);
    });

    test('a reminder for a closed task, or from someone turned off, is not sent', async () => {
      const closed = await task(owner, 'Already done');
      const [{ set_reminder: a }] = await as(owner, `select plan.set_reminder($1, current_date + 1, '08:00')`, [closed.id]);
      await as(owner, `update plan.tasks set status = 'completed' where id = $1`, [closed.id]);
      await due(a);

      await assert.rejects(as(viewer, `select plan.set_reminder($1, current_date + 1, '08:00')`, [closed.id]), /open task/);

      // A viewer may remind themselves about a task, but has turned task reminders off.
      await db.query('insert into notifications.preferences (user_id, task_reminders) values ($1, false)', [viewer.id]);
      const staffTask = await task(staff, 'Fix the fence');
      const [{ set_reminder: d }] = await as(viewer, `select plan.set_reminder($1, current_date + 1, '08:00')`, [staffTask.id]);
      await due(d);
      await sendAll();
      assert.equal(await status(a), 'cancelled');
      assert.equal(await status(d), 'skipped');
      assert.deepEqual(await inbox(viewer), []);
    });

    test('quiet hours hold a reminder until they end', async () => {
      const t = await task(owner, 'Night check');
      const [{ set_reminder: id }] = await as(owner, `select plan.set_reminder($1, current_date + 1, '08:00')`, [t.id]);
      await due(id);
      // Quiet for the whole day except one minute that has just passed.
      const now = (await db.query(`select to_char((now() at time zone 'UTC') - interval '2 minutes', 'HH24:MI') as a, to_char((now() at time zone 'UTC') - interval '1 minute', 'HH24:MI') as b`)).rows[0];
      await db.query('insert into notifications.preferences (user_id, quiet_start, quiet_end) values ($1, $2, $3) on conflict (user_id) do update set quiet_start = $2, quiet_end = $3', [owner.id, now.b, now.a]);
      await sendAll();
      assert.equal(await status(id), 'pending');
      await db.query('update notifications.preferences set quiet_start = null, quiet_end = null where user_id = $1', [owner.id]);
      await sendAll();
      assert.equal(await status(id), 'sent');
    });

    test('a reminder in the past is refused, and no client can run the sender', async () => {
      const t = await task(owner, 'Late');
      await assert.rejects(as(owner, `select plan.set_reminder($1, current_date - 1, '08:00')`, [t.id]), /has not passed/);
      await assert.rejects(as(owner, 'select plan.send_due_reminders()'), /permission denied/);
      await assert.rejects(as(owner, 'select plan.generate_all_occurrences()'), /permission denied/);
    });
  });

  describe('comments, history and reviews', () => {
    test('people comment, edit only their own, and a viewer only reads', async () => {
      const t = await task(owner, 'Plan the next batch');
      const [mine] = await as(staff, 'insert into plan.task_comments (business_id, task_id, body) values ($1, $2, $3) returning *', [farm.id, t.id, '  Chicks arrive Friday  ']);
      assert.equal(mine.body, 'Chicks arrive Friday');
      assert.equal(mine.author_id, staff.id);
      const [edited] = await as(staff, `update plan.task_comments set body = 'Chicks arrive Saturday' where id = $1 returning *`, [mine.id]);
      assert.ok(edited.edited_at);
      assert.deepEqual(await as(owner, `update plan.task_comments set body = 'Changed' where id = $1 returning id`, [mine.id]), []);
      await assert.rejects(as(viewer, 'insert into plan.task_comments (business_id, task_id, body) values ($1, $2, $3)', [farm.id, t.id, 'Hi']), /row-level security/);
      assert.equal((await as(viewer, 'select id from plan.task_comments where task_id = $1', [t.id])).length, 1);
      assert.deepEqual(await as(stranger, 'select id from plan.task_comments where task_id = $1', [t.id]), []);
    });

    test('a task keeps its history and its local completion day', async () => {
      const t = await task(owner, 'Service the generator');
      await as(staff, `update plan.tasks set status = 'in_progress', priority = 'high' where id = $1`, [t.id]);
      const [done] = await as(staff, `update plan.tasks set status = 'completed' where id = $1 returning completed_on::text`, [t.id]);
      assert.equal(done.completed_on, await today());

      const history = await as(viewer, 'select * from plan.task_history($1)', [t.id]);
      assert.equal(history.length, 3);
      assert.deepEqual(history[0].changes.status, { from: 'in_progress', to: 'completed' });
      assert.equal(history[0].actor_name, 'Schedule Staff');
      assert.deepEqual(history[1].changes.priority, { from: 'normal', to: 'high' });
      assert.equal(history[2].action, 'INSERT');
      await assert.rejects(as(stranger, 'select * from plan.task_history($1)', [t.id]), /permission/i);
    });

    test('owners write one review a week; staff read it', async () => {
      const [review] = await as(owner, `insert into plan.reviews (business_id, period_start, period_end, wins, next_priorities) values ($1, '2026-11-09', '2026-11-15', 'Sold out', 'Order feed') returning *`, [farm.id]);
      assert.equal(review.wins, 'Sold out');
      await assert.rejects(as(owner, `insert into plan.reviews (business_id, period_start, period_end) values ($1, '2026-11-09', '2026-11-15')`, [farm.id]), /duplicate key/);
      await assert.rejects(as(staff, `insert into plan.reviews (business_id, period_start, period_end) values ($1, '2026-11-16', '2026-11-22')`, [farm.id]), /row-level security/);
      assert.equal((await as(staff, 'select id from plan.reviews where business_id = $1', [farm.id])).length, 1);
    });
  });
});
