// The Plan assistant (Plan Module Developer Specification, section 4.6 and journeys 5.2, 5.3).
// It reads the minimum context as the signed-in user, so row-level security decides what it can
// see, and sends no names of people. It stores its draft as a suggestion; the database checks
// every action again, and only a person can turn one into a record.
import { AiUnavailableError, aiModel, askClaude, isAiConfigured } from '../_shared/claude.ts';
import { CORS_HEADERS, json, unavailable } from '../_shared/http.ts';
import {
  buildPlanRequest,
  PLAN_KINDS,
  PLAN_SYSTEM_PROMPT,
  planSuggestionSchema,
  suggestionPeriod,
  toStoredActions,
  validatePlanSuggestion,
  type PlanContext,
  type PlanKind,
} from '../_shared/plan-core.ts';
import { authenticatedUserId, logAiRequest, reportEvent, serviceClient, userClient, withinAiQuota } from '../_shared/supabase.ts';

const MAX_REQUEST_LENGTH = 1000;
const MAX_GOALS = 15;
const MAX_TASKS = 40;

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

type Row = Record<string, never>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (!isAiConfigured()) return unavailable('not_configured');

  const body = await req.json().catch(() => ({}));
  const businessId = typeof body.businessId === 'string' ? body.businessId : '';
  const kind = (PLAN_KINDS as readonly string[]).includes(body.kind) ? (body.kind as PlanKind) : null;
  const goalId = typeof body.goalId === 'string' ? body.goalId : null;
  const request = typeof body.request === 'string' ? body.request.trim().slice(0, MAX_REQUEST_LENGTH) : null;
  // Journey 5.3: the insight this was asked from, as text the person saw. Treated as data.
  const insight =
    body.insight && typeof body.insight.title === 'string'
      ? {
          kpiCode: typeof body.insight.kpiCode === 'string' ? body.insight.kpiCode.slice(0, 80) : null,
          title: body.insight.title.slice(0, 160),
          body: typeof body.insight.body === 'string' ? body.insight.body.slice(0, 600) : '',
          evidence: typeof body.insight.evidence === 'string' ? body.insight.evidence.slice(0, 300) : '',
        }
      : null;
  if (!businessId || !kind || (kind === 'goal_breakdown' && !goalId) || (kind === 'request' && !request)) {
    return json({ error: 'invalid_request' }, 400);
  }

  const client = userClient(req);
  const userId = await authenticatedUserId(req, client);
  if (!userId) return json({ error: 'unauthenticated' }, 401);

  // Only someone who can plan in this business may ask (section 3).
  const allowed = await client.schema('plan').rpc('assistant_context_allowed', { p_business_id: businessId });
  if (allowed.error || allowed.data !== true) return json({ error: 'forbidden' }, 403);

  const service = serviceClient();
  if (!(await withinAiQuota(service, userId))) return unavailable('quota_exceeded');
  const startedAt = Date.now();

  try {
    const plan = client.schema('plan');
    const todayResult = await plan.rpc('business_today', { p_business_id: businessId });
    const today = String(todayResult.data ?? new Date().toISOString().slice(0, 10));

    const [workspaces, industries, goals, tasks, links, schedule, overview, kpis] = await Promise.all([
      client.schema('business').rpc('my_workspaces'),
      client.schema('platform').from('industries').select('code, name'),
      plan.from('goals').select('id, title, goal_type, direction, target_value, unit, target_on, status').eq('business_id', businessId).in('status', ['active', 'at_risk', 'on_hold']).limit(MAX_GOALS),
      plan.from('tasks').select('id, title, status, priority, due_on, blocker_reason').eq('business_id', businessId).in('status', ['not_started', 'in_progress', 'blocked']).order('due_on', { ascending: true, nullsFirst: false }).limit(MAX_TASKS),
      plan.from('task_goals').select('task_id, goal_id').eq('business_id', businessId),
      plan.rpc('schedule', { p_business_id: businessId, p_from: today, p_to: addDays(today, 13) }),
      plan.rpc('overview', { p_business_id: businessId, p_from: addDays(today, -6), p_to: today }),
      client.schema('analytics').rpc('compute_kpis', { p_business_id: businessId, p_from: addDays(today, -29), p_to: today }),
    ]);
    if (goals.error || tasks.error) return json({ error: 'forbidden' }, 403);

    const business = (workspaces.data ?? []).find((workspace: { id: string }) => workspace.id === businessId) as Row | undefined;
    if (!business) return json({ error: 'forbidden' }, 403);

    const goalRows = (goals.data ?? []) as Row[];
    const progress = await Promise.all(goalRows.map((goal) => plan.rpc('goal_progress', { p_goal_id: goal.id })));
    const milestones = await plan.from('goal_milestones').select('goal_id, title, status, due_on').in('goal_id', goalRows.map((goal) => goal.id)).order('sort_order');
    const goalLinks = new Map<string, string[]>();
    for (const link of (links.data ?? []) as Row[]) goalLinks.set(link.task_id, [...(goalLinks.get(link.task_id) ?? []), link.goal_id]);
    const o = ((overview.data ?? []) as Row[])[0];

    const context: PlanContext = {
      today,
      business: {
        industry: ((industries.data ?? []) as Row[]).find((industry) => industry.code === business.industry_code)?.name ?? business.industry_code,
        currency: business.currency,
        mainGoal: business.main_goal ?? null,
      },
      goals: goalRows.map((goal, index) => {
        const p = ((progress[index]?.data ?? []) as Row[])[0];
        const words = p
          ? [p.actual !== null ? `actual ${p.actual}${p.actual_on ? ` on ${p.actual_on}` : ''}` : null, p.percent !== null ? `${p.percent}%` : null, p.note].filter(Boolean).join('; ')
          : 'unknown';
        return {
          id: goal.id,
          title: goal.title,
          goalType: goal.goal_type,
          direction: goal.direction,
          target: goal.target_value === null ? null : Number(goal.target_value),
          unit: goal.unit,
          targetOn: goal.target_on,
          status: goal.status,
          progress: words || 'no progress recorded',
          milestones: ((milestones.data ?? []) as Row[]).filter((m) => m.goal_id === goal.id).map((m) => ({ title: m.title, done: m.status === 'completed', dueOn: m.due_on })),
        };
      }),
      tasks: ((tasks.data ?? []) as Row[]).map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueOn: task.due_on,
        blocker: task.blocker_reason,
        goalIds: goalLinks.get(task.id) ?? [],
      })),
      events: ((schedule.data ?? []) as Row[])
        .filter((item) => item.kind === 'event' && item.status === 'scheduled')
        .map((item) => ({ id: item.id, title: item.title, onDate: item.on_date, time: item.start_time ? String(item.start_time).slice(0, 5) : null, eventType: item.event_type })),
      overview: o
        ? { openTasks: o.open_tasks, overdueTasks: o.overdue_tasks, blockedTasks: o.blocked_tasks, completionRate: o.completion_rate, onTimeRate: o.on_time_rate }
        : null,
      figures: ((kpis.data ?? []) as Row[]).map((kpi) => ({ code: kpi.code, name: kpi.name, value: kpi.value === null ? null : Number(kpi.value), unit: kpi.unit_kind, status: kpi.status, note: kpi.note })),
    };
    if (kind === 'goal_breakdown' && !context.goals.some((goal) => goal.id === goalId)) {
      return json({ error: 'invalid_request', reason: 'goal_not_open' }, 400);
    }

    const suggestion = await askClaude({
      system: PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPlanRequest(context, kind, { request, focusGoalId: goalId, focusInsight: insight }) }],
      schema: planSuggestionSchema,
      effort: 'medium',
    });
    const problem = validatePlanSuggestion(suggestion, context);
    if (problem) throw new AiUnavailableError(problem);

    const period = suggestionPeriod(kind, today);
    const stored = await service.schema('plan').rpc('store_recommendation', {
      p_business_id: businessId,
      p_user_id: userId,
      p_kind: kind,
      p_goal_id: kind === 'goal_breakdown' ? goalId : null,
      p_request: request,
      p_title: suggestion.title.slice(0, 160),
      p_explanation: suggestion.explanation.slice(0, 2000),
      p_assumptions: suggestion.assumptions?.slice(0, 1000) ?? null,
      p_limitations: suggestion.limitations?.slice(0, 1000) ?? null,
      p_sources: suggestion.sources.slice(0, 30).map((source) => ({ type: source.type, ref: source.ref.slice(0, 80), label: source.label.slice(0, 160) })),
      p_period_start: period.start,
      p_period_end: period.end,
      p_generator: 'ai',
      p_model: aiModel(),
      p_actions: toStoredActions(suggestion),
      p_insight: insight ? { kpi_code: insight.kpiCode, title: insight.title } : null,
    });
    // The database refused something the model proposed: treat it as unavailable, so the app
    // offers the built-in suggestions instead.
    if (stored.error) throw new AiUnavailableError(`The suggestion was refused: ${stored.error.message}`);

    await logAiRequest(service, { userId, businessId, intent: `plan:${kind}`, outcome: 'answered', latencyMs: Date.now() - startedAt });
    return json({ recommendationId: stored.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAiRequest(service, { userId, businessId, intent: `plan:${kind}`, outcome: 'failed', latencyMs: Date.now() - startedAt });
    await reportEvent(service, 'plan-assist', message);
    return unavailable(error instanceof AiUnavailableError ? 'upstream' : 'internal');
  }
});
