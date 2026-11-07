import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, numeric, parseOptionalRow, parseRow, parseRows } from '@/core/supabase/response';

import type {
  ContentOption,
  ContentStatus,
  LearnerProfile,
  LearnerProfileStatus,
  LearnerWorkspace,
  LearningContent,
  LearningContentInput,
  Lesson,
  LessonActivity,
  LessonCompletion,
  LessonContent,
  LessonResponse,
  LessonSource,
  LessonStatus,
  ReviewableLesson,
  ReviewDecision,
  WeeklyLessonState,
} from '../domain/models';
import type { LearnerProfileRepository, LearningContentRepository, LessonRepository, LessonReviewRepository } from '../domain/repositories';

const statusSchema = z.enum(['pending_review', 'changes_requested', 'rejected', 'published', 'completed', 'archived']);

const LESSON_COLUMNS = 'id, objective, title, intro, example, challenge, status, published_at, completed_at';

const lessonFields = {
  id: z.string(),
  objective: z.string(),
  title: z.string(),
  intro: z.string(),
  example: z.string(),
  challenge: z.string(),
  status: statusSchema,
  published_at: z.string().nullable(),
  completed_at: z.string().nullable(),
};

type LessonRow = z.infer<z.ZodObject<typeof lessonFields>>;

const toLesson = (row: LessonRow): Lesson => ({
  id: row.id,
  objective: row.objective,
  title: row.title,
  intro: row.intro,
  example: row.example,
  challenge: row.challenge,
  status: row.status,
  publishedAt: row.published_at,
  completedAt: row.completed_at,
});

const lessonSchema = z.object(lessonFields).transform(toLesson);

const reviewableSchema = z
  .object({
    ...lessonFields,
    content_id: z.string(),
    business_id: z.string(),
    business_context: z.string(),
    generated_by: z.enum(['template', 'ai']),
    created_at: z.string(),
  })
  .transform(
    (row): ReviewableLesson => ({
      ...toLesson(row),
      contentId: row.content_id,
      businessId: row.business_id,
      businessContext: row.business_context,
      generatedBy: row.generated_by,
      createdAt: row.created_at,
    }),
  );

const responseSchema = z
  .object({ answer: z.string().nullable(), feedback_rating: z.number().nullable(), feedback_text: z.string().nullable() })
  .transform((row): LessonResponse => ({ answer: row.answer, rating: row.feedback_rating, feedback: row.feedback_text }));

const activityRowSchema = z.object({ id: z.string(), prompt: z.string() });
const activityAnswerSchema = z.object({ activity_id: z.string(), answer: z.string() });

// Row-level security decides whose answers come back: a learner's own, or any for a reviewer.
async function fetchActivities(client: SupabaseClient, lessonId: string): Promise<LessonActivity[]> {
  const db = client.schema('learning');
  const activities = parseRows(activityRowSchema, await db.from('lesson_activities').select('id, prompt').eq('lesson_id', lessonId).order('position'));
  if (activities.length === 0) return [];
  const answers = parseRows(
    activityAnswerSchema,
    await db.from('activity_responses').select('activity_id, answer').in('activity_id', activities.map((activity) => activity.id)),
  );
  return activities.map((activity) => ({
    ...activity,
    answer: answers.find((item) => item.activity_id === activity.id)?.answer ?? null,
  }));
}

export class SupabaseLessonRepository implements LessonRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('learning');
  }

  // Prefers a draft personalised by the AI service, and otherwise adapts approved content.
  // Either way the result waits for a reviewer.
  async requestWeeklyLesson(businessId: string): Promise<void> {
    const generated = await this.client.functions.invoke('generate-lesson', { body: { businessId } });
    if (!generated.error) return;
    assertSuccess(await this.db.rpc('request_weekly_lesson', { p_business_id: businessId }));
  }

  async weeklyState(businessId: string): Promise<WeeklyLessonState | null> {
    const rows = parseRows(
      z.object({ lesson_id: z.string(), status: statusSchema }),
      await this.db.rpc('weekly_lesson_state', { p_business_id: businessId }),
    );
    const latest = rows[0];
    return latest ? { lessonId: latest.lesson_id, status: latest.status } : null;
  }

  async listMine(businessId: string): Promise<Lesson[]> {
    // Row-level security already limits the learner to their own published or completed lessons.
    return parseRows(
      lessonSchema,
      await this.db.from('lessons').select(LESSON_COLUMNS).eq('business_id', businessId).order('published_at', { ascending: false }),
    );
  }

  async get(id: string): Promise<Lesson> {
    return parseRow(lessonSchema, await this.db.from('lessons').select(LESSON_COLUMNS).eq('id', id).single());
  }

  async complete(id: string, completion: LessonCompletion): Promise<void> {
    assertSuccess(
      await this.db.rpc('complete_lesson', {
        p_lesson_id: id,
        p_answer: completion.answer,
        p_rating: completion.rating,
        p_feedback: completion.feedback,
      }),
    );
  }

  async getResponse(lessonId: string): Promise<LessonResponse | null> {
    return parseOptionalRow(
      responseSchema,
      await this.db.from('lesson_responses').select('answer, feedback_rating, feedback_text').eq('lesson_id', lessonId).maybeSingle(),
    );
  }

  async correctResponse(lessonId: string, response: LessonCompletion): Promise<void> {
    assertSuccess(
      await this.db.rpc('correct_lesson_response', {
        p_lesson_id: lessonId,
        p_answer: response.answer,
        p_rating: response.rating,
        p_feedback: response.feedback,
      }),
    );
  }

  async deleteResponse(lessonId: string): Promise<void> {
    assertSuccess(await this.db.rpc('delete_lesson_response', { p_lesson_id: lessonId }));
  }

  listActivities(lessonId: string): Promise<LessonActivity[]> {
    return fetchActivities(this.client, lessonId);
  }

  async submitActivity(activityId: string, answer: string): Promise<void> {
    assertSuccess(await this.db.rpc('submit_activity_response', { p_activity_id: activityId, p_answer: answer }));
  }
}

const learnerProfileSchema = z
  .object({
    goals: z.array(z.string()),
    topics: z.array(z.string()),
    preferred_format: z.enum(['reading', 'practical', 'short_summary']),
    status: z.enum(['active', 'deactivated', 'deletion_requested']),
  })
  .transform((row): LearnerProfile => ({ goals: row.goals, topics: row.topics, preferredFormat: row.preferred_format, status: row.status }));

export class SupabaseLearnerProfileRepository implements LearnerProfileRepository {
  constructor(private readonly client: SupabaseClient) {}

  async get(userId: string): Promise<LearnerProfile | null> {
    return parseOptionalRow(
      learnerProfileSchema,
      await this.client.schema('learning').from('learner_profiles').select('goals, topics, preferred_format, status').eq('user_id', userId).maybeSingle(),
    );
  }

  async save(userId: string, profile: LearnerProfile): Promise<void> {
    assertSuccess(
      await this.client.schema('learning').from('learner_profiles').upsert({
        user_id: userId,
        goals: profile.goals,
        topics: profile.topics,
        preferred_format: profile.preferredFormat,
        updated_at: new Date().toISOString(),
      }),
    );
  }

  async setStatus(status: LearnerProfileStatus): Promise<void> {
    assertSuccess(await this.client.schema('learning').rpc('set_learner_profile_status', { p_status: status }));
  }
}

const REVIEW_COLUMNS = `${LESSON_COLUMNS}, content_id, business_id, business_context, generated_by, created_at`;

const sourceSchema = z
  .object({ title: z.string(), topic: z.string(), version: numeric, objective: z.string() })
  .transform((row): LessonSource => row);

export class SupabaseLessonReviewRepository implements LessonReviewRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('learning');
  }

  async canReview(): Promise<boolean> {
    return parseRows(z.string(), await this.client.schema('authz').rpc('my_platform_roles')).some(
      (role) => role === 'learning_reviewer' || role === 'administrator',
    );
  }

  async list({ status, search }: { status: LessonStatus; search?: string }): Promise<ReviewableLesson[]> {
    let query = this.db.from('lessons').select(REVIEW_COLUMNS).eq('status', status);
    if (search) query = query.ilike('title', `%${search.replace(/[%_]/g, ' ')}%`);
    return parseRows(reviewableSchema, await query.order('created_at'));
  }

  async get(id: string): Promise<ReviewableLesson> {
    return parseRow(reviewableSchema, await this.db.from('lessons').select(REVIEW_COLUMNS).eq('id', id).single());
  }

  async getSource(contentId: string): Promise<LessonSource> {
    return parseRow(sourceSchema, await this.db.from('content').select('title, topic, version, objective').eq('id', contentId).single());
  }

  async edit(id: string, content: LessonContent): Promise<void> {
    assertSuccess(
      await this.db.rpc('edit_lesson', {
        p_lesson_id: id,
        p_title: content.title,
        p_intro: content.intro,
        p_example: content.example,
        p_challenge: content.challenge,
      }),
    );
  }

  async decide(id: string, decision: ReviewDecision, comments: string | null): Promise<void> {
    assertSuccess(await this.db.rpc('review_lesson', { p_lesson_id: id, p_decision: decision, p_comments: comments }));
  }

  // Prefers a redraft from the AI service, and otherwise moves to other approved content.
  async regenerate(id: string, comments: string | null): Promise<void> {
    const generated = await this.client.functions.invoke('generate-lesson', { body: { lessonId: id, comments } });
    if (!generated.error) return;
    assertSuccess(await this.db.rpc('regenerate_from_content', { p_lesson_id: id, p_comments: comments }));
  }

  async archive(id: string): Promise<void> {
    assertSuccess(await this.db.rpc('archive_lesson', { p_lesson_id: id }));
  }

  listActivities(lessonId: string): Promise<LessonActivity[]> {
    return fetchActivities(this.client, lessonId);
  }

  async setActivities(lessonId: string, prompts: string[]): Promise<void> {
    assertSuccess(await this.db.rpc('set_lesson_activities', { p_lesson_id: lessonId, p_prompts: prompts }));
  }

  async getResponse(lessonId: string): Promise<LessonResponse | null> {
    return parseOptionalRow(
      responseSchema,
      await this.db.from('lesson_responses').select('answer, feedback_rating, feedback_text').eq('lesson_id', lessonId).maybeSingle(),
    );
  }

  async deleteResponse(lessonId: string): Promise<void> {
    assertSuccess(await this.db.rpc('delete_lesson_response', { p_lesson_id: lessonId }));
  }
}

const CONTENT_COLUMNS = 'id, industry_code, topic, difficulty, objective, kpi_code, title, intro, example, challenge, activities, version, approval_status';

const contentSchema = z
  .object({
    id: z.string(),
    industry_code: z.string().nullable(),
    topic: z.string(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    objective: z.string(),
    kpi_code: z.string().nullable(),
    title: z.string(),
    intro: z.string(),
    example: z.string(),
    challenge: z.string(),
    activities: z.array(z.string()),
    version: numeric,
    approval_status: z.enum(['draft', 'approved', 'archived']),
  })
  .transform(
    (row): LearningContent => ({
      id: row.id,
      industryCode: row.industry_code,
      topic: row.topic,
      difficulty: row.difficulty,
      objective: row.objective,
      kpiCode: row.kpi_code,
      title: row.title,
      intro: row.intro,
      example: row.example,
      challenge: row.challenge,
      activities: row.activities,
      version: row.version,
      approvalStatus: row.approval_status,
    }),
  );

const toContentRow = (input: LearningContentInput) => ({
  industry_code: input.industryCode,
  topic: input.topic,
  difficulty: input.difficulty,
  objective: input.objective,
  kpi_code: input.kpiCode,
  title: input.title,
  intro: input.intro,
  example: input.example,
  challenge: input.challenge,
  activities: input.activities,
  approval_status: input.approvalStatus,
});

const optionSchema = z.object({ value: z.string(), label: z.string() }).transform((row): ContentOption => row);

const workspaceSchema = z
  .object({ user_id: z.string(), full_name: z.string(), business_id: z.string(), business_name: z.string() })
  .transform((row): LearnerWorkspace => ({ userId: row.user_id, fullName: row.full_name, businessId: row.business_id, businessName: row.business_name }));

export class SupabaseLearningContentRepository implements LearningContentRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('learning');
  }

  async list({ search, status }: { search?: string; status?: ContentStatus }): Promise<LearningContent[]> {
    let query = this.db.from('content').select(CONTENT_COLUMNS);
    if (status) query = query.eq('approval_status', status);
    if (search) query = query.ilike('title', `%${search.replace(/[%_]/g, ' ')}%`);
    return parseRows(contentSchema, await query.order('created_at', { ascending: false }));
  }

  async get(id: string): Promise<LearningContent> {
    return parseRow(contentSchema, await this.db.from('content').select(CONTENT_COLUMNS).eq('id', id).single());
  }

  async create(input: LearningContentInput): Promise<void> {
    assertSuccess(await this.db.from('content').insert(toContentRow(input)));
  }

  async update(id: string, input: LearningContentInput): Promise<void> {
    assertSuccess(await this.db.from('content').update(toContentRow(input)).eq('id', id));
  }

  async setStatus(id: string, status: ContentStatus): Promise<void> {
    assertSuccess(await this.db.from('content').update({ approval_status: status }).eq('id', id));
  }

  async learnerWorkspaces(email: string): Promise<LearnerWorkspace[]> {
    return parseRows(workspaceSchema, await this.db.rpc('admin_learner_workspaces', { p_email: email }));
  }

  async assign(contentId: string, learnerId: string, businessId: string): Promise<void> {
    assertSuccess(await this.db.rpc('admin_assign_lesson', { p_content_id: contentId, p_learner: learnerId, p_business: businessId }));
  }

  async industryOptions(): Promise<ContentOption[]> {
    const rows = parseRows(
      z.object({ code: z.string(), name: z.string() }),
      await this.client.schema('platform').from('industries').select('code, name').order('sort_order'),
    );
    return parseRows(optionSchema, { data: rows.map((row) => ({ value: row.code, label: row.name })), error: null });
  }

  async kpiOptions(): Promise<ContentOption[]> {
    const rows = parseRows(
      z.object({ code: z.string(), name: z.string() }),
      await this.client.schema('platform').from('kpi_definitions').select('code, name').order('name'),
    );
    return parseRows(optionSchema, { data: rows.map((row) => ({ value: row.code, label: row.name })), error: null });
  }
}
