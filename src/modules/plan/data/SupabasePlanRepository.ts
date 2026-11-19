import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, nullableNumeric, numeric, parseOptionalRow, parseRow, parseRows } from '@/core/supabase/response';

import type { Goal, GoalInput, GoalProgress, KpiOption, Milestone, PlanOverview, ProgressEntry, ProgressObservation, Task, TaskInput } from '../domain/models';
import type { PlanRepository } from '../domain/repositories';
import type { EventInput, PlanEvent, PlanReview, RecurringRule, Reminder, ReviewInput, RuleInput, RuleUpdate, ScheduleItem, TaskComment, TaskHistoryEntry } from '../domain/schedule';

const LIST_LIMIT = 500;

const TASK_COLUMNS =
  'id, title, description, priority, status, due_on, completed_at, completed_on, completion_note, blocker_reason, assigned_to, version, created_at, rule_id, occurrence_on';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const TASK_STATUSES = ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'] as const;

// Postgres gives times as HH:MM:SS; the app works in HH:MM.
const localTime = z
  .string()
  .nullable()
  .transform((value) => (value === null ? null : value.slice(0, 5)));

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.enum(PRIORITIES),
  status: z.enum(TASK_STATUSES),
  due_on: z.string().nullable(),
  completed_at: z.string().nullable(),
  completed_on: z.string().nullable(),
  completion_note: z.string().nullable(),
  blocker_reason: z.string().nullable(),
  assigned_to: z.string().nullable(),
  version: numeric,
  created_at: z.string(),
  rule_id: z.string().nullable(),
  occurrence_on: z.string().nullable(),
});

const toTask = (row: z.output<typeof taskSchema>, goalIds: string[]): Task => ({
  id: row.id,
  title: row.title,
  description: row.description,
  priority: row.priority,
  status: row.status,
  dueOn: row.due_on,
  completedAt: row.completed_at,
  completionNote: row.completion_note,
  blockerReason: row.blocker_reason,
  assignedTo: row.assigned_to,
  version: row.version,
  createdAt: row.created_at,
  goalIds,
  completedOn: row.completed_on,
  ruleId: row.rule_id,
  occurrenceOn: row.occurrence_on,
});

const toTaskRow = (input: TaskInput) => ({
  title: input.title,
  description: input.description,
  priority: input.priority,
  status: input.status,
  due_on: input.dueOn,
  completion_note: input.status === 'completed' ? input.completionNote : null,
  blocker_reason: input.status === 'blocked' ? input.blockerReason : null,
  assigned_to: input.assignedTo,
});

const linkSchema = z.object({ task_id: z.string(), goal_id: z.string() });

const GOAL_COLUMNS = 'id, title, description, goal_type, direction, unit, baseline_value, target_value, tolerance, kpi_code, start_on, target_on, status, status_reason';

const goalSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    goal_type: z.enum(['measurable', 'milestone']),
    direction: z.enum(['increase', 'decrease', 'maintain', 'threshold']).nullable(),
    unit: z.string().nullable(),
    baseline_value: nullableNumeric,
    target_value: nullableNumeric,
    tolerance: nullableNumeric,
    kpi_code: z.string().nullable(),
    start_on: z.string(),
    target_on: z.string().nullable(),
    status: z.enum(['active', 'on_hold', 'at_risk', 'completed', 'cancelled', 'expired']),
    status_reason: z.string().nullable(),
  })
  .transform(
    (row): Goal => ({
      id: row.id,
      title: row.title,
      description: row.description,
      goalType: row.goal_type,
      direction: row.direction,
      unit: row.unit,
      baselineValue: row.baseline_value,
      targetValue: row.target_value,
      tolerance: row.tolerance,
      kpiCode: row.kpi_code,
      startOn: row.start_on,
      targetOn: row.target_on,
      status: row.status,
      statusReason: row.status_reason,
    }),
  );

const toGoalRow = (input: GoalInput) => ({
  title: input.title,
  description: input.description,
  direction: input.direction,
  unit: input.unit,
  baseline_value: input.baselineValue,
  target_value: input.targetValue,
  tolerance: input.tolerance,
  kpi_code: input.kpiCode,
  start_on: input.startOn,
  target_on: input.targetOn,
  status: input.status,
  status_reason: input.statusReason,
});

const progressSchema = z
  .object({
    actual: nullableNumeric,
    actual_on: z.string().nullable(),
    source: z.enum(['manual', 'kpi', 'kpi_estimated', 'milestones']).nullable(),
    percent: nullableNumeric,
    progress_status: z.enum(['no_data', 'in_progress', 'target_met', 'percent_unavailable', 'on_track', 'off_track', 'below_threshold', 'no_milestones', 'all_milestones_done']),
    note: z.string().nullable(),
    milestones_done: numeric,
    milestones_total: numeric,
  })
  .transform(
    (row): GoalProgress => ({
      actual: row.actual,
      actualOn: row.actual_on,
      source: row.source,
      percent: row.percent,
      progressStatus: row.progress_status,
      note: row.note,
      milestonesDone: row.milestones_done,
      milestonesTotal: row.milestones_total,
    }),
  );

const milestoneSchema = z
  .object({
    id: z.string(),
    goal_id: z.string(),
    title: z.string(),
    due_on: z.string().nullable(),
    status: z.enum(['pending', 'completed']),
    completed_at: z.string().nullable(),
    sort_order: numeric,
  })
  .transform((row): Milestone => ({ id: row.id, goalId: row.goal_id, title: row.title, dueOn: row.due_on, status: row.status, completedAt: row.completed_at, sortOrder: row.sort_order }));

const overviewSchema = z
  .object({
    today: z.string(),
    open_tasks: numeric,
    overdue_tasks: numeric,
    blocked_tasks: numeric,
    due_today: numeric,
    completed_in_period: numeric,
    active_goals: numeric,
    eligible_due: numeric,
    completion_rate: nullableNumeric,
    on_time_rate: nullableNumeric,
  })
  .transform(
    (row): PlanOverview => ({
      today: row.today,
      openTasks: row.open_tasks,
      overdueTasks: row.overdue_tasks,
      blockedTasks: row.blocked_tasks,
      dueToday: row.due_today,
      completedInPeriod: row.completed_in_period,
      activeGoals: row.active_goals,
      eligibleDue: row.eligible_due,
      completionRate: row.completion_rate,
      onTimeRate: row.on_time_rate,
    }),
  );

const kpiSchema = z.object({ code: z.string(), name: z.string(), unit_kind: z.string() }).transform((row): KpiOption => ({ code: row.code, name: row.name, unitKind: row.unit_kind }));

const idSchema = z.object({ id: z.string() });

const observationSchema = z
  .object({ id: z.string(), recorded_on: z.string(), actual_value: numeric, note: z.string().nullable(), created_at: z.string(), created_by: z.string().nullable() })
  .transform(
    (row): ProgressObservation => ({ id: row.id, recordedOn: row.recorded_on, actualValue: row.actual_value, note: row.note, createdAt: row.created_at, createdBy: row.created_by }),
  );

const RULE_COLUMNS = 'id, title, description, priority, assigned_to, frequency, interval_count, days_of_week, day_of_month, starts_on, ends_on, status';

const ruleSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    priority: z.enum(PRIORITIES),
    assigned_to: z.string().nullable(),
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval_count: numeric,
    days_of_week: z.array(numeric).nullable(),
    day_of_month: nullableNumeric,
    starts_on: z.string(),
    ends_on: z.string().nullable(),
    status: z.enum(['active', 'ended']),
  })
  .transform(
    (row): RecurringRule => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      assignedTo: row.assigned_to,
      frequency: row.frequency,
      intervalCount: row.interval_count,
      daysOfWeek: row.days_of_week ?? [],
      dayOfMonth: row.day_of_month,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      status: row.status,
    }),
  );

const EVENT_COLUMNS = 'id, title, description, event_type, starts_on, start_time, end_time, status, version';
const EVENT_TYPES = ['meeting', 'delivery', 'appointment', 'deadline', 'other'] as const;
const EVENT_STATUSES = ['scheduled', 'done', 'cancelled'] as const;

const eventSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    event_type: z.enum(EVENT_TYPES),
    starts_on: z.string(),
    start_time: localTime,
    end_time: localTime,
    status: z.enum(EVENT_STATUSES),
    version: numeric,
  })
  .transform(
    (row): PlanEvent => ({
      id: row.id,
      title: row.title,
      description: row.description,
      eventType: row.event_type,
      startsOn: row.starts_on,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      version: row.version,
    }),
  );

const toEventRow = (input: EventInput) => ({
  title: input.title,
  description: input.description,
  event_type: input.eventType,
  starts_on: input.startsOn,
  start_time: input.startTime,
  end_time: input.startTime ? input.endTime : null,
  status: input.status,
});

const scheduleSchema = z
  .object({
    kind: z.enum(['task', 'event', 'projected']),
    id: z.string().nullable(),
    rule_id: z.string().nullable(),
    title: z.string(),
    on_date: z.string(),
    start_time: localTime,
    end_time: localTime,
    status: z.enum([...TASK_STATUSES, ...EVENT_STATUSES]),
    priority: z.enum(PRIORITIES).nullable(),
    assigned_to: z.string().nullable(),
    event_type: z.enum(EVENT_TYPES).nullable(),
  })
  .transform(
    (row): ScheduleItem => ({
      kind: row.kind,
      id: row.id,
      ruleId: row.rule_id,
      title: row.title,
      onDate: row.on_date,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      priority: row.priority,
      assignedTo: row.assigned_to,
      eventType: row.event_type,
    }),
  );

const reminderSchema = z
  .object({ id: z.string(), remind_at: z.string(), status: z.enum(['pending', 'sent', 'dismissed', 'skipped', 'cancelled']), sent_at: z.string().nullable() })
  .transform((row): Reminder => ({ id: row.id, remindAt: row.remind_at, status: row.status, sentAt: row.sent_at }));

const commentSchema = z
  .object({ id: z.string(), author_id: z.string(), body: z.string(), created_at: z.string(), edited_at: z.string().nullable() })
  .transform((row): TaskComment => ({ id: row.id, authorId: row.author_id, body: row.body, createdAt: row.created_at, editedAt: row.edited_at }));

const historySchema = z
  .object({
    occurred_at: z.string(),
    action: z.enum(['INSERT', 'UPDATE', 'DELETE']),
    actor_name: z.string().nullable(),
    changes: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })),
  })
  .transform((row): TaskHistoryEntry => ({ occurredAt: row.occurred_at, action: row.action, actorName: row.actor_name, changes: row.changes }));

const REVIEW_COLUMNS = 'id, period_start, period_end, summary, wins, blockers, next_priorities, updated_at';

const reviewSchema = z
  .object({
    id: z.string(),
    period_start: z.string(),
    period_end: z.string(),
    summary: z.string().nullable(),
    wins: z.string().nullable(),
    blockers: z.string().nullable(),
    next_priorities: z.string().nullable(),
    updated_at: z.string(),
  })
  .transform(
    (row): PlanReview => ({
      id: row.id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      summary: row.summary,
      wins: row.wins,
      blockers: row.blockers,
      nextPriorities: row.next_priorities,
      updatedAt: row.updated_at,
    }),
  );

const countSchema = z.coerce.number();

// Row-level security limits every read and write to members with the plan permissions.
export class SupabasePlanRepository implements PlanRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('plan');
  }

  async overview(businessId: string, period: { from: string; to: string }): Promise<PlanOverview> {
    const [row] = parseRows(overviewSchema, await this.db.rpc('overview', { p_business_id: businessId, p_from: period.from, p_to: period.to }));
    if (!row) throw new Error('The plan overview could not be loaded.');
    return row;
  }

  private async linksFor(filter: { businessId?: string; taskId?: string }): Promise<Map<string, string[]>> {
    let query = this.db.from('task_goals').select('task_id, goal_id');
    if (filter.businessId) query = query.eq('business_id', filter.businessId);
    if (filter.taskId) query = query.eq('task_id', filter.taskId);
    const map = new Map<string, string[]>();
    for (const link of parseRows(linkSchema, await query)) map.set(link.task_id, [...(map.get(link.task_id) ?? []), link.goal_id]);
    return map;
  }

  async listTasks(businessId: string): Promise<Task[]> {
    const [rows, links] = await Promise.all([
      this.db.from('tasks').select(TASK_COLUMNS).eq('business_id', businessId).order('due_on', { ascending: true, nullsFirst: false }).order('created_at').limit(LIST_LIMIT),
      this.linksFor({ businessId }),
    ]);
    return parseRows(taskSchema, rows).map((row) => toTask(row, links.get(row.id) ?? []));
  }

  async getTask(id: string): Promise<Task> {
    const [row, links] = await Promise.all([this.db.from('tasks').select(TASK_COLUMNS).eq('id', id).single(), this.linksFor({ taskId: id })]);
    return toTask(parseRow(taskSchema, row), links.get(id) ?? []);
  }

  // The task is saved first, then its goals, so a failed link never loses the task.
  private async setGoals(businessId: string, taskId: string, goalIds: string[], current: string[]): Promise<void> {
    const removed = current.filter((id) => !goalIds.includes(id));
    const added = goalIds.filter((id) => !current.includes(id));
    if (removed.length > 0) assertSuccess(await this.db.from('task_goals').delete().eq('task_id', taskId).in('goal_id', removed));
    if (added.length > 0) assertSuccess(await this.db.from('task_goals').insert(added.map((goalId) => ({ task_id: taskId, goal_id: goalId, business_id: businessId }))));
  }

  async createTask(businessId: string, input: TaskInput): Promise<string> {
    const { id } = parseRow(idSchema, await this.db.from('tasks').insert({ business_id: businessId, ...toTaskRow(input) }).select('id').single());
    await this.setGoals(businessId, id, input.goalIds, []);
    return id;
  }

  async updateTask(businessId: string, id: string, input: TaskInput, expectedVersion?: number): Promise<void> {
    let query = this.db.from('tasks').update(toTaskRow(input)).eq('id', id);
    if (expectedVersion !== undefined) query = query.eq('version', expectedVersion);
    const updated = parseRows(idSchema, await query.select('id'));
    // Section 8: a change made meanwhile elsewhere is surfaced rather than silently overwritten.
    if (updated.length === 0) {
      throw new AppError('conflict', 'Someone changed this task while you were working on it. Nothing was saved. Open it again to see the latest version.');
    }
    const current = (await this.linksFor({ taskId: id })).get(id) ?? [];
    await this.setGoals(businessId, id, input.goalIds, current);
  }

  async listGoals(businessId: string): Promise<Goal[]> {
    return parseRows(goalSchema, await this.db.from('goals').select(GOAL_COLUMNS).eq('business_id', businessId).order('created_at', { ascending: false }).limit(LIST_LIMIT));
  }

  async getGoal(id: string): Promise<Goal> {
    return parseRow(goalSchema, await this.db.from('goals').select(GOAL_COLUMNS).eq('id', id).single());
  }

  async goalProgress(goalId: string): Promise<GoalProgress> {
    const [row] = parseRows(progressSchema, await this.db.rpc('goal_progress', { p_goal_id: goalId }));
    if (!row) throw new Error('The goal progress could not be loaded.');
    return row;
  }

  async createGoal(businessId: string, input: GoalInput): Promise<string> {
    return parseRow(idSchema, await this.db.from('goals').insert({ business_id: businessId, goal_type: input.goalType, ...toGoalRow(input) }).select('id').single()).id;
  }

  async updateGoal(id: string, input: GoalInput): Promise<void> {
    assertSuccess(await this.db.from('goals').update(toGoalRow(input)).eq('id', id));
  }

  async addProgress(businessId: string, goalId: string, entry: ProgressEntry): Promise<void> {
    assertSuccess(
      await this.db.from('goal_progress').insert({ business_id: businessId, goal_id: goalId, recorded_on: entry.recordedOn, actual_value: entry.actualValue, note: entry.note }),
    );
  }

  async listProgress(goalId: string): Promise<ProgressObservation[]> {
    return parseRows(
      observationSchema,
      await this.db
        .from('goal_progress')
        .select('id, recorded_on, actual_value, note, created_at, created_by')
        .eq('goal_id', goalId)
        .order('recorded_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
    );
  }

  async listMilestones(goalId: string): Promise<Milestone[]> {
    return parseRows(
      milestoneSchema,
      await this.db.from('goal_milestones').select('id, goal_id, title, due_on, status, completed_at, sort_order').eq('goal_id', goalId).order('sort_order').order('created_at'),
    );
  }

  async addMilestone(businessId: string, goalId: string, input: { title: string; dueOn: string | null; sortOrder: number }): Promise<void> {
    assertSuccess(await this.db.from('goal_milestones').insert({ business_id: businessId, goal_id: goalId, title: input.title, due_on: input.dueOn, sort_order: input.sortOrder }));
  }

  async setMilestoneStatus(id: string, status: Milestone['status']): Promise<void> {
    assertSuccess(await this.db.from('goal_milestones').update({ status }).eq('id', id));
  }

  async removeMilestone(id: string): Promise<void> {
    assertSuccess(await this.db.from('goal_milestones').delete().eq('id', id));
  }

  async kpiOptions(businessId: string): Promise<KpiOption[]> {
    return parseRows(kpiSchema, await this.db.rpc('kpi_options', { p_business_id: businessId }));
  }

  async schedule(businessId: string, period: { from: string; to: string }): Promise<ScheduleItem[]> {
    return parseRows(scheduleSchema, await this.db.rpc('schedule', { p_business_id: businessId, p_from: period.from, p_to: period.to }));
  }

  async generateOccurrences(businessId: string): Promise<number> {
    const response = await this.db.rpc('generate_occurrences', { p_business_id: businessId });
    assertSuccess(response);
    return countSchema.parse(response.data ?? 0);
  }

  async getRule(id: string): Promise<RecurringRule> {
    return parseRow(ruleSchema, await this.db.from('recurring_rules').select(RULE_COLUMNS).eq('id', id).single());
  }

  async createRule(businessId: string, input: RuleInput): Promise<string> {
    const row = {
      business_id: businessId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      assigned_to: input.assignedTo,
      frequency: input.frequency,
      interval_count: input.intervalCount,
      days_of_week: input.frequency === 'weekly' ? input.daysOfWeek : null,
      day_of_month: input.frequency === 'monthly' ? input.dayOfMonth : null,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
    };
    return parseRow(idSchema, await this.db.from('recurring_rules').insert(row).select('id').single()).id;
  }

  async updateRule(id: string, input: RuleUpdate): Promise<void> {
    assertSuccess(
      await this.db
        .from('recurring_rules')
        .update({ title: input.title, description: input.description, priority: input.priority, assigned_to: input.assignedTo, ends_on: input.endsOn })
        .eq('id', id),
    );
  }

  async endRule(id: string): Promise<void> {
    assertSuccess(await this.db.from('recurring_rules').update({ status: 'ended' }).eq('id', id));
  }

  async listOccurrences(ruleId: string): Promise<Task[]> {
    const rows = await this.db.from('tasks').select(TASK_COLUMNS).eq('rule_id', ruleId).order('occurrence_on', { ascending: false }).limit(60);
    return parseRows(taskSchema, rows).map((row) => toTask(row, []));
  }

  async getEvent(id: string): Promise<PlanEvent> {
    return parseRow(eventSchema, await this.db.from('events').select(EVENT_COLUMNS).eq('id', id).single());
  }

  async createEvent(businessId: string, input: EventInput): Promise<string> {
    return parseRow(idSchema, await this.db.from('events').insert({ business_id: businessId, ...toEventRow(input) }).select('id').single()).id;
  }

  async updateEvent(id: string, input: EventInput): Promise<void> {
    assertSuccess(await this.db.from('events').update(toEventRow(input)).eq('id', id));
  }

  async listReminders(taskId: string): Promise<Reminder[]> {
    return parseRows(reminderSchema, await this.db.from('task_reminders').select('id, remind_at, status, sent_at').eq('task_id', taskId).order('remind_at'));
  }

  async setReminder(taskId: string, on: string, at: string): Promise<void> {
    assertSuccess(await this.db.rpc('set_reminder', { p_task_id: taskId, p_on: on, p_at: at }));
  }

  async snoozeReminder(id: string, minutes: number): Promise<void> {
    assertSuccess(await this.db.rpc('snooze_reminder', { p_id: id, p_minutes: minutes }));
  }

  async dismissReminder(id: string): Promise<void> {
    assertSuccess(await this.db.rpc('dismiss_reminder', { p_id: id }));
  }

  async listComments(taskId: string): Promise<TaskComment[]> {
    return parseRows(commentSchema, await this.db.from('task_comments').select('id, author_id, body, created_at, edited_at').eq('task_id', taskId).order('created_at').limit(200));
  }

  async addComment(businessId: string, taskId: string, body: string): Promise<void> {
    assertSuccess(await this.db.from('task_comments').insert({ business_id: businessId, task_id: taskId, body }));
  }

  async editComment(id: string, body: string): Promise<void> {
    assertSuccess(await this.db.from('task_comments').update({ body }).eq('id', id));
  }

  async removeComment(id: string): Promise<void> {
    assertSuccess(await this.db.from('task_comments').delete().eq('id', id));
  }

  async taskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
    return parseRows(historySchema, await this.db.rpc('task_history', { p_task_id: taskId }));
  }

  async listReviews(businessId: string): Promise<PlanReview[]> {
    return parseRows(reviewSchema, await this.db.from('reviews').select(REVIEW_COLUMNS).eq('business_id', businessId).order('period_start', { ascending: false }).limit(52));
  }

  async getReview(businessId: string, periodStart: string): Promise<PlanReview | null> {
    return parseOptionalRow(reviewSchema, await this.db.from('reviews').select(REVIEW_COLUMNS).eq('business_id', businessId).eq('period_start', periodStart).maybeSingle());
  }

  // Insert or update rather than upsert, since clients may not write the key columns on update.
  async saveReview(businessId: string, period: { from: string; to: string }, input: ReviewInput): Promise<void> {
    const notes = { summary: input.summary, wins: input.wins, blockers: input.blockers, next_priorities: input.nextPriorities };
    const existing = await this.getReview(businessId, period.from);
    if (existing) {
      assertSuccess(await this.db.from('reviews').update(notes).eq('id', existing.id));
    } else {
      assertSuccess(await this.db.from('reviews').insert({ business_id: businessId, period_start: period.from, period_end: period.to, ...notes }));
    }
  }
}
