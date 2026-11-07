// Drafts personalised lessons from approved content (FR-F16 to FR-F21, FR-F29). Every draft
// is stored as pending review, so this service can never publish anything itself.
import { AiUnavailableError, askClaude, isAiConfigured } from '../_shared/claude.ts';
import { CORS_HEADERS, json, unavailable } from '../_shared/http.ts';
import { buildLessonRequest, buildRegenerationRequest, LESSON_SYSTEM_PROMPT, lessonSchema, validateLesson, type LessonContext, type RegenerationContext } from '../_shared/lesson-core.ts';
import { authenticatedUserId, logAiRequest, reportEvent, serviceClient, userClient, withinAiQuota } from '../_shared/supabase.ts';

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (!isAiConfigured()) return unavailable('not_configured');

  const body = await req.json().catch(() => ({}));
  const client = userClient(req);
  const userId = await authenticatedUserId(req, client);
  if (!userId) return json({ error: 'unauthenticated' }, 401);

  const service = serviceClient();
  if (!(await withinAiQuota(service, userId))) return unavailable('quota_exceeded');
  const startedAt = Date.now();

  try {
    if (typeof body.lessonId === 'string') {
      // The context function refuses anyone who is not a reviewer.
      const context = await client.schema('learning').rpc('lesson_regeneration_context', { p_lesson_id: body.lessonId });
      if (context.error) return json({ error: 'forbidden' }, 403);
      const regeneration = context.data as RegenerationContext;
      const contentId = 'source';
      const comments = typeof body.comments === 'string' ? body.comments : null;

      const draft = await askClaude({
        system: LESSON_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildRegenerationRequest(regeneration, comments, contentId) }],
        schema: lessonSchema,
        effort: 'medium',
      });
      const problem = validateLesson(draft, [contentId]);
      if (problem) throw new AiUnavailableError(problem);

      const stored = await service.schema('learning').rpc('store_regenerated_lesson', {
        p_lesson: body.lessonId,
        p_reviewer: userId,
        p_comments: comments,
        p_title: draft.title,
        p_intro: draft.intro,
        p_example: draft.example,
        p_challenge: draft.challenge,
      });
      if (stored.error) throw new Error(stored.error.message);
      await logAiRequest(service, { userId, businessId: null, intent: 'lesson:regenerate', outcome: 'answered', latencyMs: Date.now() - startedAt });
      return json({ ok: true });
    }

    const businessId = typeof body.businessId === 'string' ? body.businessId : '';
    if (!businessId) return json({ error: 'invalid_request' }, 400);

    // The context function refuses anyone who is not a member of the business.
    const contextResult = await client.schema('learning').rpc('lesson_generation_context', { p_business_id: businessId });
    if (contextResult.error) return json({ error: 'forbidden' }, 403);
    const context = contextResult.data as LessonContext;
    if (context.already_requested) return json({ ok: true, skipped: 'already_requested' });
    if (context.candidates.length === 0) return json({ ok: true, skipped: 'no_content' });

    const kpis = await client.schema('analytics').rpc('compute_kpis', { p_business_id: businessId, p_from: isoDaysAgo(29), p_to: isoDaysAgo(0) });
    const figures = (kpis.data ?? []).map((kpi: Record<string, never>) => ({ name: kpi.name, value: kpi.value, unit: kpi.unit_kind, status: kpi.status }));

    const draft = await askClaude({
      system: LESSON_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildLessonRequest(context, figures) }],
      schema: lessonSchema,
      effort: 'medium',
    });
    const problem = validateLesson(draft, context.candidates.map((candidate) => candidate.id));
    if (problem) throw new AiUnavailableError(problem);

    const stored = await service.schema('learning').rpc('store_generated_lesson', {
      p_learner: userId,
      p_business: businessId,
      p_content: draft.content_id,
      p_business_context: context.business.context,
      p_objective: draft.objective,
      p_title: draft.title,
      p_intro: draft.intro,
      p_example: draft.example,
      p_challenge: draft.challenge,
      p_context: { figures, currency: context.business.currency, learner: context.learner },
    });
    if (stored.error) throw new Error(stored.error.message);
    await logAiRequest(service, { userId, businessId, intent: 'lesson:generate', outcome: 'answered', latencyMs: Date.now() - startedAt });
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAiRequest(service, { userId, businessId: null, intent: 'lesson:error', outcome: 'failed', latencyMs: Date.now() - startedAt });
    await reportEvent(service, 'generate-lesson', message);
    return unavailable(error instanceof AiUnavailableError ? 'upstream' : 'internal');
  }
});
