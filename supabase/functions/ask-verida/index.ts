// Ask Verida's AI service (FR-G07 to FR-G15). Reads business figures as the signed-in user, so
// row-level security decides what it can see, and it never writes a business record.
import { answerSchema, ASSISTANT_SYSTEM_PROMPT, buildUserMessage, normaliseHistory, toClientAnswer, type AssistantFacts } from '../_shared/assistant-core.ts';
import { AiUnavailableError, askClaude, isAiConfigured } from '../_shared/claude.ts';
import { CORS_HEADERS, json, unavailable } from '../_shared/http.ts';
import { authenticatedUserId, logAiRequest, reportEvent, serviceClient, userClient, withinAiQuota } from '../_shared/supabase.ts';

const FACT_PERIOD_DAYS = 30;
const MAX_QUESTION_LENGTH = 2000;

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const body = await req.json().catch(() => ({}));
  // The monitoring screen uses this to report whether the service is up and configured.
  if (body.ping) return json({ ok: true, ai_configured: isAiConfigured() });
  if (!isAiConfigured()) return unavailable('not_configured');

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const businessId = typeof body.businessId === 'string' ? body.businessId : '';
  if (!question || question.length > MAX_QUESTION_LENGTH || !businessId) {
    return json({ error: 'invalid_request' }, 400);
  }

  const client = userClient(req);
  const userId = await authenticatedUserId(req, client);
  if (!userId) return json({ error: 'unauthenticated' }, 401);

  const service = serviceClient();
  if (!(await withinAiQuota(service, userId))) return unavailable('quota_exceeded');

  const startedAt = Date.now();
  try {
    const today = isoDaysAgo(0);
    const from = isoDaysAgo(FACT_PERIOD_DAYS - 1);

    const kpis = await client.schema('analytics').rpc('compute_kpis', { p_business_id: businessId, p_from: from, p_to: today });
    if (kpis.error) return json({ error: 'forbidden' }, 403);

    const [workspaces, recent, industries, history] = await Promise.all([
      client.schema('business').rpc('my_workspaces'),
      client.schema('analytics').rpc('recent_activity', { p_business_id: businessId, p_limit: 10 }),
      client.schema('platform').from('industries').select('code, name'),
      typeof body.conversationId === 'string'
        ? client.schema('assistant').from('messages').select('role, content').eq('conversation_id', body.conversationId).order('created_at')
        : Promise.resolve({ data: [] }),
    ]);

    const business = (workspaces.data ?? []).find((workspace: { id: string }) => workspace.id === businessId);
    if (!business) return json({ error: 'forbidden' }, 403);

    const facts: AssistantFacts = {
      today,
      periodFrom: from,
      periodTo: today,
      business: {
        name: business.name,
        industry: (industries.data ?? []).find((industry: { code: string }) => industry.code === business.industry_code)?.name ?? business.industry_code,
        currency: business.currency,
        mainGoal: business.main_goal,
      },
      kpis: (kpis.data ?? []).map((kpi: Record<string, never>) => ({
        name: kpi.name,
        value: kpi.value,
        unit: kpi.unit_kind,
        status: kpi.status,
        note: kpi.note,
        explanation: kpi.explanation,
      })),
      recent: recent.data ?? [],
    };

    // The app saves the user's message before calling, so leave that copy out of the history.
    const previous = (history.data ?? []) as { role: 'user' | 'assistant'; content: string }[];
    const prior = previous.at(-1)?.role === 'user' ? previous.slice(0, -1) : previous;

    const parsed = await askClaude({
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [...normaliseHistory(prior), { role: 'user', content: buildUserMessage(question, facts) }],
      schema: answerSchema,
      effort: 'low',
    });

    const answer = toClientAnswer(parsed);
    await logAiRequest(service, {
      userId,
      businessId,
      intent: answer.intent,
      outcome: answer.confidence === 'insufficient_data' ? 'insufficient_data' : 'answered',
      latencyMs: Date.now() - startedAt,
    });
    return json(answer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAiRequest(service, { userId, businessId, intent: 'error', outcome: 'failed', latencyMs: Date.now() - startedAt });
    await reportEvent(service, 'ask-verida', message);
    return unavailable(error instanceof AiUnavailableError ? 'upstream' : 'internal');
  }
});
