// Plan Module Developer Specification v1.0: suggestions from an insight (journey 5.3), offline
// goals, milestones and events made once (section 8), and files attached to tasks.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { addMember, asUser, createDatabase, createUser, registerBusiness } from './harness.mjs';

describe('plan gaps', () => {
  let db, owner, staff, viewer, stranger, farm, other;

  const as = async (user, sql, params = []) => (await asUser(db, user.id, (tx) => tx.query(sql, params))).rows;
  const one = async (user, sql, params = []) => (await as(user, sql, params))[0];

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Gap Owner' });
    staff = await createUser(db, { name: 'Gap Staff' });
    viewer = await createUser(db, { name: 'Gap Viewer' });
    stranger = await createUser(db, { name: 'Gap Stranger' });
    farm = await registerBusiness(db, owner.id, { name: 'Gap Farm', industry: 'poultry' });
    other = await registerBusiness(db, stranger.id, { name: 'Other Gap Farm', industry: 'poultry' });
    await addMember(db, owner.id, staff, farm.id, 'staff');
    await addMember(db, owner.id, viewer, farm.id, 'viewer');
    await db.query(`update business.businesses set time_zone = 'UTC' where id = $1`, [farm.id]);
  });

  test('a task accepted from an insight links to the insight’s measure (journey 5.3)', async () => {
    const insight = { kpi_code: 'revenue', title: 'Revenue is down 20%' };
    const [{ suggest_from_rules: id }] = await as(staff, `select plan.suggest_from_rules($1, 'insight_actions', null, null, $2::jsonb)`, [farm.id, JSON.stringify(insight)]);
    const rec = await one(owner, 'select insight_kpi, insight_title, generator from plan.recommendations where id = $1', [id]);
    assert.deepEqual(rec, { insight_kpi: 'revenue', insight_title: 'Revenue is down 20%', generator: 'rules' });
    const [action] = (await db.query('select id, proposed_payload, why from plan.recommendation_actions where recommendation_id = $1 order by sort_order', [id])).rows;
    assert.equal(action.proposed_payload.title, 'Look into: Revenue is down 20%');
    assert.match(action.why, /From your insight/);

    const [{ accept_action: taskId }] = await as(staff, 'select plan.accept_action($1)', [action.id]);
    const links = await as(viewer, 'select link_type, kpi_code, label from plan.task_links where task_id = $1', [taskId]);
    assert.deepEqual(links, [{ link_type: 'kpi', kpi_code: 'revenue', label: 'Revenue is down 20%' }]);
  });

  test('an unknown measure is not stored as the insight, and the AI service can still store without one', async () => {
    const [{ id }] = (
      await db.query(
        `select plan.store_recommendation($1, $2, 'request', null, 'Help', 'T', 'E', null, null, '[]', null, null, 'ai', 'm',
                '[{"type":"create_task","payload":{"title":"A"}}]', '{"kpi_code":"made_up","title":"X"}') as id`,
        [farm.id, owner.id],
      )
    ).rows;
    assert.equal((await one(owner, 'select insight_kpi from plan.recommendations where id = $1', [id])).insight_kpi, null);
    await db.query(`select plan.store_recommendation($1, $2, 'weekly_plan', null, null, 'T', 'E', null, null, '[]', null, null, 'ai', 'm', '[]')`, [farm.id, owner.id]);
  });

  test('goals and milestones sent twice from a device are made once', async () => {
    const clientId = '1f6d2a52-3c1e-4bd4-9f6f-2c4f1d8a7b01';
    const goal = await one(owner, `insert into plan.goals (business_id, title, goal_type, client_id) values ($1, 'Offline goal', 'milestone', $2) returning id`, [farm.id, clientId]);
    await assert.rejects(as(owner, `insert into plan.goals (business_id, title, goal_type, client_id) values ($1, 'Offline goal', 'milestone', $2)`, [farm.id, clientId]), /duplicate key/);
    const milestoneClient = '2a6d2a52-3c1e-4bd4-9f6f-2c4f1d8a7b02';
    await one(owner, `insert into plan.goal_milestones (business_id, goal_id, title, client_id) values ($1, $2, 'Step', $3) returning id`, [farm.id, goal.id, milestoneClient]);
    await assert.rejects(as(owner, `insert into plan.goal_milestones (business_id, goal_id, title, client_id) values ($1, $2, 'Step', $3)`, [farm.id, goal.id, milestoneClient]), /duplicate key/);
  });

  test('task files live in the business’s plan folder and are as private as the plan', async () => {
    const t = await one(staff, `insert into plan.tasks (business_id, title) values ($1, 'With a photo') returning id`, [farm.id]);
    const path = `${farm.id}/plan/fence.jpg`;
    await as(staff, `insert into storage.objects (bucket_id, name) values ('business-files', $1)`, [path]);
    await as(staff, 'update plan.tasks set attachment_paths = $2 where id = $1', [t.id, [path]]);
    assert.equal((await as(viewer, `select name from storage.objects where name = $1`, [path])).length, 1, 'a viewer of the plan sees it');
    assert.deepEqual(await as(stranger, `select name from storage.objects where name = $1`, [path]), []);
    await assert.rejects(as(viewer, `insert into storage.objects (bucket_id, name) values ('business-files', $1)`, [`${farm.id}/plan/x.jpg`]), /row-level security/);
    await assert.rejects(as(staff, 'update plan.tasks set attachment_paths = $2 where id = $1', [t.id, [`${farm.id}/receipts/a.jpg`]]), /check constraint/);
    await assert.rejects(as(staff, 'update plan.tasks set attachment_paths = $2 where id = $1', [t.id, [`${other.id}/plan/a.jpg`]]), /check constraint/);
  });
});
