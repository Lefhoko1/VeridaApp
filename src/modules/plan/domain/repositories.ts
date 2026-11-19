import type { Goal, GoalInput, GoalProgress, KpiOption, Milestone, PlanOverview, ProgressEntry, ProgressObservation, Task, TaskInput } from './models';
import type { EventInput, PlanEvent, PlanReview, RecurringRule, Reminder, ReviewInput, RuleInput, RuleUpdate, ScheduleItem, TaskComment, TaskHistoryEntry } from './schedule';

export interface PlanRepository {
  overview(businessId: string, period: { from: string; to: string }): Promise<PlanOverview>;
  listTasks(businessId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  createTask(businessId: string, input: TaskInput): Promise<string>;
  // With an expected version, a change made meanwhile on another device is refused, not overwritten.
  updateTask(businessId: string, id: string, input: TaskInput, expectedVersion?: number): Promise<void>;
  listGoals(businessId: string): Promise<Goal[]>;
  getGoal(id: string): Promise<Goal>;
  goalProgress(goalId: string): Promise<GoalProgress>;
  createGoal(businessId: string, input: GoalInput): Promise<string>;
  updateGoal(id: string, input: GoalInput): Promise<void>;
  addProgress(businessId: string, goalId: string, entry: ProgressEntry): Promise<void>;
  listProgress(goalId: string): Promise<ProgressObservation[]>;
  listMilestones(goalId: string): Promise<Milestone[]>;
  addMilestone(businessId: string, goalId: string, input: { title: string; dueOn: string | null; sortOrder: number }): Promise<void>;
  setMilestoneStatus(id: string, status: Milestone['status']): Promise<void>;
  removeMilestone(id: string): Promise<void>;
  kpiOptions(businessId: string): Promise<KpiOption[]>;

  // P1: schedule and repeating tasks.
  schedule(businessId: string, period: { from: string; to: string }): Promise<ScheduleItem[]>;
  generateOccurrences(businessId: string): Promise<number>;
  getRule(id: string): Promise<RecurringRule>;
  createRule(businessId: string, input: RuleInput): Promise<string>;
  updateRule(id: string, input: RuleUpdate): Promise<void>;
  endRule(id: string): Promise<void>;
  listOccurrences(ruleId: string): Promise<Task[]>;
  getEvent(id: string): Promise<PlanEvent>;
  createEvent(businessId: string, input: EventInput): Promise<string>;
  updateEvent(id: string, input: EventInput): Promise<void>;

  // P1: reminders, comments and history.
  listReminders(taskId: string): Promise<Reminder[]>;
  setReminder(taskId: string, on: string, at: string): Promise<void>;
  snoozeReminder(id: string, minutes: number): Promise<void>;
  dismissReminder(id: string): Promise<void>;
  listComments(taskId: string): Promise<TaskComment[]>;
  addComment(businessId: string, taskId: string, body: string): Promise<void>;
  editComment(id: string, body: string): Promise<void>;
  removeComment(id: string): Promise<void>;
  taskHistory(taskId: string): Promise<TaskHistoryEntry[]>;

  // P1: weekly reviews.
  listReviews(businessId: string): Promise<PlanReview[]>;
  getReview(businessId: string, periodStart: string): Promise<PlanReview | null>;
  saveReview(businessId: string, period: { from: string; to: string }, input: ReviewInput): Promise<void>;
}
