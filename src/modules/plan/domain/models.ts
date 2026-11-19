// Plan Module Developer Specification v1.0. Plan holds intentions and commitments: it never
// changes a business record or a measure, and it never calculates a figure of its own.

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

export const PRIORITY_LABELS: Record<TaskPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  // A business day, YYYY-MM-DD.
  dueOn: string | null;
  completedAt: string | null;
  completionNote: string | null;
  blockerReason: string | null;
  assignedTo: string | null;
  version: number;
  createdAt: string;
  goalIds: string[];
  // The business-local day it was completed, set by the database.
  completedOn: string | null;
  // Set when the task is one occurrence of a repeating series.
  ruleId: string | null;
  occurrenceOn: string | null;
  // Photos and PDFs attached to the task.
  attachmentPaths: string[];
};

export type TaskInput = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueOn: string | null;
  completionNote: string | null;
  blockerReason: string | null;
  assignedTo: string | null;
  goalIds: string[];
};

export type GoalType = 'measurable' | 'milestone';
export type GoalDirection = 'increase' | 'decrease' | 'maintain' | 'threshold';
export type GoalStatus = 'active' | 'on_hold' | 'at_risk' | 'completed' | 'cancelled' | 'expired';

export const DIRECTION_LABELS: Record<GoalDirection, string> = {
  increase: 'Increase to a target',
  decrease: 'Reduce to a target',
  maintain: 'Keep at a level',
  threshold: 'Reach at least',
};
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  at_risk: 'At risk',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  goalType: GoalType;
  direction: GoalDirection | null;
  unit: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  tolerance: number | null;
  kpiCode: string | null;
  startOn: string;
  targetOn: string | null;
  status: GoalStatus;
  statusReason: string | null;
};

export type GoalInput = Omit<Goal, 'id'>;

// Section 7: the backend's answer for one goal. The percentage is present only where its
// formula is valid, and the note says why otherwise.
export type ProgressSource = 'manual' | 'kpi' | 'kpi_estimated' | 'milestones';
export type ProgressStatus =
  | 'no_data'
  | 'in_progress'
  | 'target_met'
  | 'percent_unavailable'
  | 'on_track'
  | 'off_track'
  | 'below_threshold'
  | 'no_milestones'
  | 'all_milestones_done';

export type GoalProgress = {
  actual: number | null;
  actualOn: string | null;
  source: ProgressSource | null;
  percent: number | null;
  progressStatus: ProgressStatus;
  note: string | null;
  milestonesDone: number;
  milestonesTotal: number;
};

export type GoalWithProgress = Goal & { progress: GoalProgress };

export type Milestone = {
  id: string;
  goalId: string;
  title: string;
  dueOn: string | null;
  status: 'pending' | 'completed';
  completedAt: string | null;
  sortOrder: number;
};

export type ProgressEntry = { recordedOn: string; actualValue: number; note: string | null };

// Section 4.2: a dated observation, with who recorded it.
export type ProgressObservation = ProgressEntry & { id: string; createdAt: string; createdBy: string | null };

export type PlanOverview = {
  today: string;
  openTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  dueToday: number;
  completedInPeriod: number;
  activeGoals: number;
  eligibleDue: number;
  completionRate: number | null;
  onTimeRate: number | null;
};

export type KpiOption = { code: string; name: string; unitKind: string };

export const isOpen = (task: Pick<Task, 'status'>) => task.status === 'not_started' || task.status === 'in_progress' || task.status === 'blocked';

// Section 7: an open task whose due date is before the business's today.
export const isOverdue = (task: Pick<Task, 'status' | 'dueOn'>, today: string) => isOpen(task) && task.dueOn !== null && task.dueOn < today;

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

// Today's focus (section 4.1): overdue first, then due today, then by priority and due date.
export function focusOrder(tasks: Task[], today: string): Task[] {
  const bucket = (task: Task) => (isOverdue(task, today) ? 0 : task.dueOn === today ? 1 : task.dueOn === null ? 3 : 2);
  return tasks
    .filter(isOpen)
    .slice()
    .sort(
      (a, b) =>
        bucket(a) - bucket(b) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

// Plain words for a goal's progress, never inventing a percentage the backend did not give.
export function describeProgress(goal: Pick<Goal, 'goalType' | 'unit' | 'targetValue'>, progress: GoalProgress): string {
  if (goal.goalType === 'milestone') return progress.note ?? 'No milestones yet.';
  if (progress.actual === null) return progress.note ?? 'No progress recorded yet.';
  const unit = goal.unit ? ` ${goal.unit}` : '';
  const figures = `${progress.actual}${unit} of ${goal.targetValue ?? '?'}${unit}`;
  if (progress.percent !== null) return `${figures} · ${progress.percent}%`;
  return progress.note ? `${figures} · ${progress.note}` : figures;
}
