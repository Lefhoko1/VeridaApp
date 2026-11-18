import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, nullableNumeric, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { Goal, GoalInput, GoalProgress, KpiOption, Milestone, PlanOverview, ProgressEntry, Task, TaskInput } from '../domain/models';
import type { PlanRepository } from '../domain/repositories';

const LIST_LIMIT = 500;

const TASK_COLUMNS = 'id, title, description, priority, status, due_on, completed_at, completion_note, blocker_reason, assigned_to, version, created_at';

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'cancelled']),
  due_on: z.string().nullable(),
  completed_at: z.string().nullable(),
  completion_note: z.string().nullable(),
  blocker_reason: z.string().nullable(),
  assigned_to: z.string().nullable(),
  version: numeric,
  created_at: z.string(),
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

  async updateTask(businessId: string, id: string, input: TaskInput): Promise<void> {
    assertSuccess(await this.db.from('tasks').update(toTaskRow(input)).eq('id', id));
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
}
