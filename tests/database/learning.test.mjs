// FR-F16 to FR-F40 and FR-H01 to FR-H09: lesson governance and the notifications it triggers.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { asUser, createDatabase, createUser, grantPlatformRole, registerBusiness } from './harness.mjs';

describe('lesson review workflow', () => {
  let db, owner, reviewer, biz;

  const requestLesson = () =>
    asUser(db, owner.id, (tx) => tx.query('select learning.request_weekly_lesson($1)', [biz.id]));
  const lessonState = async () =>
    (await asUser(db, owner.id, (tx) => tx.query('select * from learning.weekly_lesson_state($1)', [biz.id]))).rows[0];
  const visibleToLearner = async () =>
    (await asUser(db, owner.id, (tx) => tx.query('select id from learning.lessons'))).rows;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
    reviewer = await createUser(db);
    await grantPlatformRole(db, reviewer.id, 'learning_reviewer');
    biz = await registerBusiness(db, owner.id);
    await requestLesson();
  });

  test('a new draft waits for review and its content is hidden from the learner (FR-F21, FR-F22)', async () => {
    assert.equal((await lessonState()).status, 'pending_review');
    assert.equal((await visibleToLearner()).length, 0);
  });

  test('a business with no records gets the getting-started lesson', async () => {
    const { rows } = await asUser(db, reviewer.id, (tx) => tx.query('select title from learning.lessons'));
    assert.equal(rows[0].title, 'Start building a useful business record');
  });

  test('requesting again does not create a duplicate draft', async () => {
    await requestLesson();
    const { rows } = await db.query('select id from learning.lessons where learner_id = $1', [owner.id]);
    assert.equal(rows.length, 1);
  });

  test('a learner cannot review or publish a lesson', async () => {
    const { lesson_id: id } = await lessonState();
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query(`select learning.review_lesson($1, 'approve', null)`, [id])),
      /Only a learning reviewer/,
    );
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query(`update learning.lessons set status = 'published' where id = $1`, [id])),
      /permission denied/,
    );
  });

  test('a reviewer can edit, then approval publishes and notifies the learner (FR-F26 to FR-F32)', async () => {
    const { lesson_id: id } = await lessonState();
    await asUser(db, reviewer.id, async (tx) => {
      await tx.query(`select learning.edit_lesson($1, 'Edited title', 'Intro', 'Example', 'Challenge')`, [id]);
      await tx.query(`select learning.review_lesson($1, 'approve', 'Looks good')`, [id]);
    });

    assert.equal((await visibleToLearner()).length, 1);
    const review = (await db.query('select reviewer_id, decision, comments from learning.lesson_reviews where lesson_id = $1', [id])).rows[0];
    assert.deepEqual(review, { reviewer_id: reviewer.id, decision: 'approve', comments: 'Looks good' });

    const inbox = await asUser(db, owner.id, (tx) =>
      tx.query(`select title, body from notifications.notifications where type = 'lesson'`),
    );
    assert.deepEqual(inbox.rows, [{ title: 'Your weekly lesson is ready', body: 'Edited title' }]);
  });

  test('a decided lesson cannot be decided again', async () => {
    const { lesson_id: id } = await lessonState();
    await assert.rejects(
      asUser(db, reviewer.id, (tx) => tx.query(`select learning.review_lesson($1, 'reject', null)`, [id])),
      /already been decided/,
    );
  });

  test('completing a lesson records the response (FR-F36 to FR-F39)', async () => {
    const { lesson_id: id } = await lessonState();
    await asUser(db, owner.id, (tx) =>
      tx.query(`select learning.complete_lesson($1, 'My answer', 5, 'Useful')`, [id]),
    );
    assert.equal((await lessonState()).status, 'completed');
    const { rows } = await asUser(db, owner.id, (tx) => tx.query('select answer, feedback_rating from learning.lesson_responses'));
    assert.deepEqual(rows, [{ answer: 'My answer', feedback_rating: 5 }]);
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query(`select learning.complete_lesson($1, 'Again', 1, null)`, [id])),
      /not available to complete/,
    );
  });

  test('another learner cannot complete someone else\'s lesson', async () => {
    const other = await createUser(db);
    const { lesson_id: id } = await lessonState();
    await assert.rejects(
      asUser(db, other.id, (tx) => tx.query(`select learning.complete_lesson($1, 'x', 1, null)`, [id])),
      /not available to complete/,
    );
  });

  test('rejection and change requests keep the lesson from the learner', async () => {
    const learner = await createUser(db);
    const shop = await registerBusiness(db, learner.id, { industry: 'retail' });
    await asUser(db, learner.id, (tx) => tx.query('select learning.request_weekly_lesson($1)', [shop.id]));
    const id = (await db.query('select id from learning.lessons where learner_id = $1', [learner.id])).rows[0].id;

    await asUser(db, reviewer.id, (tx) => tx.query(`select learning.review_lesson($1, 'request_changes', 'Fix it')`, [id]));
    const hidden = await asUser(db, learner.id, (tx) => tx.query('select id from learning.lessons'));
    assert.equal(hidden.rows.length, 0);

    await asUser(db, reviewer.id, (tx) => tx.query(`select learning.review_lesson($1, 'reject', 'No')`, [id]));
    const status = (await db.query('select status from learning.lessons where id = $1', [id])).rows[0].status;
    assert.equal(status, 'rejected');
  });

  test('a non-member cannot request a lesson for a business', async () => {
    const outsider = await createUser(db);
    await assert.rejects(
      asUser(db, outsider.id, (tx) => tx.query('select learning.request_weekly_lesson($1)', [biz.id])),
      /not a member/,
    );
  });
});

describe('notifications', () => {
  let db;
  before(async () => {
    db = await createDatabase();
  });

  const inbox = (userId) =>
    asUser(db, userId, async (tx) => (await tx.query('select id, type, read_at from notifications.notifications')).rows);

  test('verified accounts receive a welcome notification with a delivery record (FR-H01, FR-H09)', async () => {
    const user = await createUser(db);
    const messages = await inbox(user.id);
    assert.deepEqual(messages.map((m) => m.type), ['account']);
    const delivery = (await db.query('select channel, status from notifications.deliveries where notification_id = $1', [messages[0].id])).rows[0];
    assert.deepEqual(delivery, { channel: 'in_app', status: 'delivered' });
  });

  test('invitations notify an existing user (FR-H02)', async () => {
    const owner = await createUser(db);
    const invited = await createUser(db);
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, (tx) => tx.query(`select * from business.invite_member($1, $2, 'staff')`, [biz.id, invited.email]));
    assert.ok((await inbox(invited.id)).some((m) => m.type === 'invitation'));
  });

  test('users can mark their notifications read but cannot rewrite them (FR-H07)', async () => {
    const user = await createUser(db);
    const [message] = await inbox(user.id);
    await asUser(db, user.id, (tx) => tx.query('update notifications.notifications set read_at = now() where id = $1', [message.id]));
    assert.ok((await inbox(user.id))[0].read_at);
    await assert.rejects(
      asUser(db, user.id, (tx) => tx.query(`update notifications.notifications set title = 'x' where id = $1`, [message.id])),
      /permission denied/,
    );
  });

  test('users cannot read or create notifications for someone else', async () => {
    const [a, b] = [await createUser(db), await createUser(db)];
    const seen = await asUser(db, a.id, (tx) => tx.query('select user_id from notifications.notifications'));
    assert.ok(seen.rows.every((r) => r.user_id === a.id));
    await assert.rejects(
      asUser(db, a.id, (tx) => tx.query(`select notifications.deliver($1, 'account', 't', 'b')`, [b.id])),
      /permission denied/,
    );
  });

  test('a disabled preference suppresses optional messages (FR-H08)', async () => {
    const owner = await createUser(db);
    const reviewer = await createUser(db);
    await grantPlatformRole(db, reviewer.id, 'learning_reviewer');
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, async (tx) => {
      await tx.query('insert into notifications.preferences (user_id, lesson_published) values ($1, false)', [owner.id]);
      await tx.query('select learning.request_weekly_lesson($1)', [biz.id]);
    });
    const id = (await db.query('select id from learning.lessons where learner_id = $1', [owner.id])).rows[0].id;
    await asUser(db, reviewer.id, (tx) => tx.query(`select learning.review_lesson($1, 'approve', null)`, [id]));
    assert.ok(!(await inbox(owner.id)).some((m) => m.type === 'lesson'));
  });
});
