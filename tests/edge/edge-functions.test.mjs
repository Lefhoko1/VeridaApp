// Runs the real Edge Functions under Deno against the real migrations, with fake Claude and
// Resend servers. This proves the wiring without spending API credit. It does not prove what
// the real model answers, or that the prompts produce good lessons.
//
//   npm run test:edge
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SERVICE_KEY, startEmulator, VERIFICATION_CODE } from '../integration/emulator.mjs';

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/functions');
const children = [];
const fakeRequests = [];
let fakeMode = 'ok';

function fakeUpstream() {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    fakeRequests.push({ url: req.url, headers: req.headers, body });
    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.url === '/emails') return send(fakeMode === 'resend-fail' ? 500 : 200, { id: 'email-1' });

    if (fakeMode === 'anthropic-500') return send(500, { type: 'error', error: { type: 'api_error', message: 'Overloaded' } });
    const message = (content, stopReason = 'end_turn') =>
      send(200, { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content, stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    if (fakeMode === 'refusal') return message([], 'refusal');

    const text = body.messages.at(-1).content;
    if (String(body.system).includes('planning assistant')) {
      const today = /<today>(.*?)<\/today>/.exec(text)[1];
      const goalId = /<focus_goal>id (\S+):/.exec(text)?.[1] ?? null;
      return message([{ type: 'text', text: JSON.stringify({
        title: 'This week',
        explanation: 'Focus on buyers.',
        assumptions: 'You work weekdays.',
        limitations: null,
        sources: [],
        actions: [{
          type: 'create_task', why: 'To move the goal', title: 'Call two buyers', description: null, priority: 'high',
          due_on: fakeMode === 'bad-plan' ? '2001-01-01' : today, goal_ids: goalId ? [goalId] : [], task_id: null, goal_id: null,
          event_type: null, starts_on: null, start_time: null, end_time: null, target_on: null,
        }],
      }) }]);
    }
    if (String(body.system).includes('Ask Verida')) {
      return message([{ type: 'text', text: JSON.stringify({
        text: 'Your revenue is BWP 84.',
        confidence: 'verified',
        relates_to_business: true,
        intent: 'kpi:revenue',
        capture: { target: 'sale', item_or_description: 'Eggs', category: null, activity_name: null, quantity: '2', unit: 'trays', unit_price: null, amount: null, occurred_on: null, missing_fields: ['unit price'] },
      }) }]);
    }
    const material = JSON.parse(/<approved_material>\n([\s\S]*?)\n<\/approved_material>/.exec(text)[1]);
    return message([{ type: 'text', text: JSON.stringify({
      content_id: fakeMode === 'bad-lesson' ? 'not-approved' : material[0].id,
      objective: 'AI objective',
      title: 'AI drafted title',
      intro: 'AI intro',
      example: 'AI example',
      challenge: 'AI challenge',
    }) }]);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

async function startFunction(name, port, env) {
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['deno', 'run', '--node-modules-dir=none', '--no-lock', '--import-map=import_map.json', '--allow-net', '--allow-env', `${name}/index.ts`],
    { cwd: FUNCTIONS_DIR, shell: process.platform === 'win32', env: { ...process.env, NODE_ENV: 'development', DENO_NO_PACKAGE_JSON: '1', DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, ...env }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(child);
  child.stderr.on('data', (chunk) => {
    const line = chunk.toString();
    if (/error/i.test(line) && !/NODE_TLS/.test(line)) console.error(`[${name}] ${line}`);
  });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await fetch(url, { method: 'OPTIONS' });
      return url;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${name} did not start`);
}

describe('edge functions under Deno', () => {
  let emulator, upstream, baseEnv, ask, lesson, dispatch, askUnconfigured, planAssist;

  const auth = (path, body) => fetch(`${emulator.url}/auth/v1/${path}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());

  async function newUser(label) {
    const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@verida.test`;
    await auth('signup', { email, password: 'Verida2026', data: { full_name: label } });
    const session = await auth('verify', { type: 'signup', email, token: VERIFICATION_CODE });
    return { email, token: session.access_token, id: session.user.id };
  }

  const rest = async (token, schema, path, body) => {
    const response = await fetch(`${emulator.url}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Accept-Profile': schema, 'Content-Profile': schema, Prefer: 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };

  const call = (url, token, body) =>
    fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (response) => ({ status: response.status, data: await response.json() }));

  async function newBusiness(user, name = 'Edge Farm') {
    const { data } = await rest(user.token, 'business', 'rpc/register_business', {
      p_name: name, p_industry_code: 'poultry', p_stage: 'Already operating', p_size: 'Small-scale', p_country: 'Botswana',
      p_location: 'Gaborone', p_currency: 'BWP', p_main_goal: 'Grow', p_record_keeping: 'None',
    });
    return data.id;
  }

  before(async () => {
    emulator = await startEmulator();
    upstream = await fakeUpstream();
    baseEnv = {
      SUPABASE_URL: emulator.url,
      SUPABASE_ANON_KEY: 'publishable-test-key',
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      SUPABASE_PUBLISHABLE_KEYS: '',
      SUPABASE_SECRET_KEYS: '',
    };
    const ai = { ...baseEnv, ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: upstream.url };
    [ask, lesson, dispatch, askUnconfigured, planAssist] = await Promise.all([
      startFunction('ask-verida', 18101, ai),
      startFunction('generate-lesson', 18102, ai),
      startFunction('dispatch-email', 18103, { ...baseEnv, RESEND_API_KEY: 'test-key', RESEND_API_URL: `${upstream.url}/emails` }),
      startFunction('ask-verida', 18104, { ...baseEnv, ANTHROPIC_API_KEY: '' }),
      startFunction('plan-assist', 18105, ai),
    ]);
  }, { timeout: 180000 });

  after(async () => {
    for (const child of children) {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      else child.kill();
    }
    upstream?.server.close();
    await emulator?.stop();
  });

  test('reports when no API key is set, so the app can fall back to rules', async () => {
    const user = await newUser('unconfigured');
    assert.deepEqual((await call(askUnconfigured, user.token, { ping: true })).data, { ok: true, ai_configured: false });
    const response = await call(askUnconfigured, user.token, { question: 'Hi', businessId: 'x' });
    assert.equal(response.status, 503);
    assert.equal(response.data.reason, 'not_configured');
  });

  test('answers with validated figures, using the agreed API request shape', async () => {
    fakeMode = 'ok';
    const user = await newUser('asker');
    const businessId = await newBusiness(user);
    await rest(user.token, 'records', 'sales_transactions', { business_id: businessId, occurred_on: new Date().toISOString().slice(0, 10), item_name: 'Eggs', category: 'Egg sales', quantity: 2, unit_price: 42 });

    const response = await call(ask, user.token, { question: 'What is my revenue?', businessId });
    assert.equal(response.status, 200);
    assert.equal(response.data.confidence, 'verified');
    assert.deepEqual(response.data.capturePrefill, { description: 'Eggs', quantity: '2', unit: 'trays' });
    assert.deepEqual(response.data.missingFields, ['unit price']);

    const sent = fakeRequests.findLast((r) => r.url.startsWith('/v1/messages'));
    assert.equal(sent.body.model, 'claude-opus-5-5');
    assert.equal(sent.body.fallbacks, 'default');
    assert.match(sent.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(sent.body.output_config.effort, 'low');
    assert.equal(sent.body.output_config.format.type, 'json_schema');
    assert.match(sent.body.messages.at(-1).content, /Revenue: BWP 84/);
    assert.match(sent.body.messages.at(-1).content, /What is my revenue\?$/);

    const logged = await rest(SERVICE_KEY, 'assistant', 'request_log?select=source,outcome,user_id');
    assert.ok(logged.data.some((row) => row.user_id === user.id && row.source === 'ai' && row.outcome === 'answered'));
  });

  test('includes earlier turns of the conversation, leaving out the copy just saved', async () => {
    fakeMode = 'ok';
    const user = await newUser('history');
    const businessId = await newBusiness(user);
    const created = await rest(user.token, 'assistant', 'conversations', { user_id: user.id, business_id: businessId, title: 't' });
    const conversationId = created.data[0].id;
    for (const [role, content] of [['user', 'First question'], ['assistant', 'First answer'], ['user', 'Second question']]) {
      await rest(user.token, 'assistant', 'messages', { conversation_id: conversationId, role, content });
    }
    await call(ask, user.token, { question: 'Second question', businessId, conversationId });
    const sent = fakeRequests.findLast((r) => r.url.startsWith('/v1/messages'));
    assert.deepEqual(sent.body.messages.slice(0, -1).map((m) => m.content), ['First question', 'First answer']);
    assert.equal(sent.body.messages.length, 3);
  });

  test('refuses another business, and requests without a user', async () => {
    const owner = await newUser('owner');
    const stranger = await newUser('stranger');
    const businessId = await newBusiness(owner);
    assert.equal((await call(ask, stranger.token, { question: 'Their revenue?', businessId })).status, 403);
    assert.equal((await call(ask, 'not-a-token', { question: 'Hi', businessId })).status, 401);
  });

  test('stops at the hourly limit', async () => {
    const user = await newUser('quota');
    const businessId = await newBusiness(user);
    const rows = Array.from({ length: 30 }, () => ({ user_id: user.id, business_id: businessId, intent: 'x', outcome: 'answered', source: 'ai' }));
    await rest(SERVICE_KEY, 'assistant', 'request_log', rows);
    const response = await call(ask, user.token, { question: 'One more', businessId });
    assert.equal(response.status, 503);
    assert.equal(response.data.reason, 'quota_exceeded');
  });

  test('falls back on an upstream failure or refusal, and records it', async () => {
    const user = await newUser('failure');
    const businessId = await newBusiness(user);
    for (const mode of ['anthropic-500', 'refusal']) {
      fakeMode = mode;
      const response = await call(ask, user.token, { question: 'Hello?', businessId });
      assert.equal(response.status, 503, mode);
      assert.equal(response.data.error, 'ai_unavailable', mode);
    }
    fakeMode = 'ok';
    const logged = await rest(SERVICE_KEY, 'assistant', 'request_log?select=outcome,user_id');
    assert.equal(logged.data.filter((row) => row.user_id === user.id && row.outcome === 'failed').length, 2);
    const events = await rest(SERVICE_KEY, 'platform', 'system_events?select=source');
    assert.ok(events.data.some((event) => event.source === 'ask-verida'));
  });

  test('drafts a lesson from approved content, which waits for review (FR-F16, F21, F22)', async () => {
    fakeMode = 'ok';
    const user = await newUser('learner');
    const businessId = await newBusiness(user);

    const response = await call(lesson, user.token, { businessId });
    assert.deepEqual(response.data, { ok: true });

    const hidden = await rest(user.token, 'learning', 'lessons?select=id');
    assert.equal(hidden.data.length, 0, 'the learner cannot read an unreviewed draft');

    const stored = await rest(SERVICE_KEY, 'learning', `lessons?select=title,status,generated_by,generation_context&learner_id=eq.${user.id}`);
    assert.equal(stored.data[0].title, 'AI drafted title');
    assert.equal(stored.data[0].status, 'pending_review');
    assert.equal(stored.data[0].generated_by, 'ai');
    assert.equal(stored.data[0].generation_context.currency, 'BWP');

    assert.deepEqual((await call(lesson, user.token, { businessId })).data, { ok: true, skipped: 'already_requested' });
  });

  test('refuses a draft that is not based on approved content (FR-F16)', async () => {
    fakeMode = 'bad-lesson';
    const user = await newUser('badlesson');
    const businessId = await newBusiness(user);
    assert.equal((await call(lesson, user.token, { businessId })).status, 503);
    fakeMode = 'ok';
    const stored = await rest(SERVICE_KEY, 'learning', `lessons?select=id&learner_id=eq.${user.id}`);
    assert.equal(stored.data.length, 0);
  });

  test('refuses a non-member, and lets only a reviewer regenerate (FR-F29)', async () => {
    fakeMode = 'ok';
    const learner = await newUser('regen');
    const stranger = await newUser('regenstranger');
    const businessId = await newBusiness(learner);
    assert.equal((await call(lesson, stranger.token, { businessId })).status, 403);

    await call(lesson, learner.token, { businessId });
    const lessonId = (await rest(SERVICE_KEY, 'learning', `lessons?select=id&learner_id=eq.${learner.id}`)).data[0].id;
    assert.equal((await call(lesson, learner.token, { lessonId, comments: 'x' })).status, 403);

    const reviewer = await newUser('reviewer');
    await fetch(`${emulator.url}/__emulator/grant-role`, { method: 'POST', body: JSON.stringify({ email: reviewer.email, role: 'learning_reviewer' }) });
    assert.deepEqual((await call(lesson, reviewer.token, { lessonId, comments: 'Shorter please' })).data, { ok: true });

    const sent = fakeRequests.findLast((r) => r.url.startsWith('/v1/messages'));
    assert.match(sent.body.messages.at(-1).content, /Shorter please/);
    const review = await rest(SERVICE_KEY, 'learning', `lesson_reviews?select=decision,comments,reviewer_id&lesson_id=eq.${lessonId}`);
    assert.deepEqual(review.data[0], { decision: 'regenerate', comments: 'Shorter please', reviewer_id: reviewer.id });
  });

  test('sends queued email and records delivery, retrying a failure (FR-H09)', async () => {
    const user = await newUser('mailbox');

    fakeMode = 'resend-fail';
    let result = await call(dispatch, '', {});
    assert.ok(result.data.failed > 0);
    let row = (await rest(SERVICE_KEY, 'notifications', `outbox?select=status,last_error&to_email=eq.${user.email}`)).data[0];
    assert.equal(row.status, 'pending');
    assert.match(row.last_error, /Resend 500/);

    fakeMode = 'ok';
    result = await call(dispatch, '', {});
    assert.ok(result.data.sent > 0);
    for (let drain = 0; drain < 10 && result.data.sent > 0; drain += 1) result = await call(dispatch, '', {});
    row = (await rest(SERVICE_KEY, 'notifications', `outbox?select=status,delivery_id&to_email=eq.${user.email}`)).data[0];
    assert.equal(row.status, 'sent');

    const delivery = (await rest(SERVICE_KEY, 'notifications', `deliveries?select=channel,status&id=eq.${row.delivery_id}`)).data[0];
    assert.deepEqual(delivery, { channel: 'email', status: 'delivered' });

    const sent = fakeRequests.findLast((r) => r.url === '/emails' && r.body.to === user.email);
    assert.equal(sent.body.subject, 'Welcome to Verida');
    assert.match(sent.body.from, /accounts@verida\.vinabbie\.com/);
    assert.match(sent.body.html, /verida/);
  });

  test('escapes content placed into an email', async () => {
    const owner = await newUser('escape');
    const businessId = await newBusiness(owner, '<script>alert(1)</script> Farm');
    await rest(owner.token, 'business', 'rpc/invite_member', { p_business_id: businessId, p_email: 'html-check@example.com', p_role: 'staff' });
    fakeMode = 'ok';
    for (let drain = 0; drain < 10; drain += 1) {
      const result = await call(dispatch, '', {});
      if (result.data.sent === 0) break;
    }
    const sent = fakeRequests.findLast((r) => r.url === '/emails' && r.body.to === 'html-check@example.com');
    assert.ok(sent);
    assert.ok(!sent.body.html.includes('<script>'));
    assert.ok(sent.body.html.includes('&lt;script&gt;'));
  });

  test('drafts plan suggestions that wait for the owner, and refuses an unsafe draft (Plan section 4.6)', async () => {
    fakeMode = 'ok';
    const user = await newUser('planner');
    const businessId = await newBusiness(user, 'Plan Edge Farm');
    const goal = await rest(user.token, 'plan', 'goals', { business_id: businessId, title: 'Open a farm shop', goal_type: 'milestone' });
    const goalId = goal.data[0].id;

    const response = await call(planAssist, user.token, { businessId, kind: 'goal_breakdown', goalId });
    assert.equal(response.status, 200);
    const rec = await rest(user.token, 'plan', `recommendations?id=eq.${response.data.recommendationId}&select=generator,model,goal_id,status`);
    assert.deepEqual(rec.data[0], { generator: 'ai', model: 'claude-opus-5-5', goal_id: goalId, status: 'open' });
    const actions = await rest(user.token, 'plan', `recommendation_actions?recommendation_id=eq.${response.data.recommendationId}&select=approval_status,proposed_payload`);
    assert.equal(actions.data[0].approval_status, 'proposed');
    assert.deepEqual(actions.data[0].proposed_payload.goal_ids, [goalId]);
    const tasks = await rest(user.token, 'plan', `tasks?business_id=eq.${businessId}&select=id`);
    assert.deepEqual(tasks.data, [], 'nothing is created until the owner accepts');

    const sent = fakeRequests.findLast((r) => r.url.startsWith('/v1/messages'));
    assert.equal(sent.body.output_config.effort, 'medium');
    assert.match(sent.body.messages.at(-1).content, /Open a farm shop/);

    fakeMode = 'bad-plan';
    const refused = await call(planAssist, user.token, { businessId, kind: 'weekly_plan' });
    assert.equal(refused.status, 503);
    fakeMode = 'ok';

    const stranger = await newUser('plan-stranger');
    assert.equal((await call(planAssist, stranger.token, { businessId, kind: 'weekly_plan' })).status, 403);
  });
});
