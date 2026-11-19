// Plan Module Developer Specification v1.0: suggestions from Verida (section 4.6), Plan
// settings (sections 3 and 13), links from tasks to records (4.3), related measures (4.2) and
// offline capture (section 8). Plain TypeScript, no React or Supabase.

import type { TaskInput, TaskPriority, TaskStatus } from './models';

// ---------------------------------------------------------------------------------------------
// Suggestions.

export type SuggestionKind = 'weekly_plan' | 'goal_breakdown' | 'insight_actions' | 'request';
export type ActionType = 'create_task' | 'update_task' | 'create_milestone' | 'create_event' | 'create_goal';
export type ApprovalStatus = 'proposed' | 'accepted' | 'edited' | 'dismissed';

export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  weekly_plan: 'Help me plan next week',
  goal_breakdown: 'Break a goal into steps',
  insight_actions: 'Turn my figures into actions',
  request: 'Ask in my own words',
};

export type ActionPayload = {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  due_on?: string;
  goal_ids?: string[];
  task_id?: string;
  task_title?: string;
  expected_version?: number;
  goal_id?: string;
  event_type?: string;
  starts_on?: string;
  start_time?: string;
  end_time?: string;
  target_on?: string;
};

export type SuggestedAction = {
  id: string;
  type: ActionType;
  payload: ActionPayload;
  finalPayload: ActionPayload | null;
  why: string | null;
  status: ApprovalStatus;
  createdTaskId: string | null;
  createdGoalId: string | null;
  createdEventId: string | null;
  createdMilestoneId: string | null;
  decidedAt: string | null;
};

export type SuggestionSource = { type: 'kpi' | 'goal' | 'task' | 'event'; ref: string; label: string };

export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  goalId: string | null;
  request: string | null;
  title: string;
  explanation: string;
  assumptions: string | null;
  limitations: string | null;
  sources: SuggestionSource[];
  periodStart: string | null;
  periodEnd: string | null;
  generator: 'ai' | 'rules';
  model: string | null;
  status: 'open' | 'decided' | 'dismissed' | 'superseded';
  generatedAt: string;
  actions: SuggestedAction[];
};

export type SuggestionRequest = { businessId: string; kind: SuggestionKind; goalId?: string | null; request?: string | null };

// The outcome of asking: which suggestion was made, and whether the AI or the built-in rules made it.
export type SuggestionResult = { suggestionId: string | null; source: 'ai' | 'rules' };

// Section 4.6: drafts suggestions. The implementation tries the AI service and falls back to
// Verida's built-in rules, so a person always gets something grounded.
export interface PlanAdvisor {
  suggest(request: SuggestionRequest): Promise<SuggestionResult>;
}

// The edits a person may make before accepting, by action type.
export type ActionEdits = Partial<Pick<ActionPayload, 'title' | 'description' | 'priority' | 'due_on' | 'starts_on' | 'start_time' | 'end_time' | 'target_on'>>;

const PRIORITY_WORDS: Record<TaskPriority, string> = { low: 'low', normal: 'normal', high: 'high', urgent: 'urgent' };

// Plain words for one proposed action, so a person knows exactly what accepting it does.
export function describeAction(action: Pick<SuggestedAction, 'type' | 'payload' | 'finalPayload'>, goalTitle: (id: string) => string | null, formatDay: (iso: string) => string) {
  const p = action.finalPayload ?? action.payload;
  const due = p.due_on ? `by ${formatDay(p.due_on)}` : null;
  const goals = (p.goal_ids ?? []).map(goalTitle).filter(Boolean);
  switch (action.type) {
    case 'create_task':
      return { verb: 'Add task', heading: p.title ?? '', detail: [due, p.priority && p.priority !== 'normal' ? `${PRIORITY_WORDS[p.priority]} priority` : null, goals.length ? `for ${goals.join(', ')}` : null].filter(Boolean).join(' · ') };
    case 'update_task':
      return {
        verb: 'Change task',
        heading: p.task_title ?? 'A task',
        detail: [p.due_on ? `move to ${formatDay(p.due_on)}` : null, p.priority ? `make it ${PRIORITY_WORDS[p.priority]} priority` : null].filter(Boolean).join(' and '),
      };
    case 'create_milestone':
      return { verb: 'Add milestone', heading: p.title ?? '', detail: [p.goal_id ? goalTitle(p.goal_id) : null, due].filter(Boolean).join(' · ') };
    case 'create_event':
      return { verb: 'Add to schedule', heading: p.title ?? '', detail: [p.starts_on ? formatDay(p.starts_on) : null, p.start_time ? (p.end_time ? `${p.start_time}–${p.end_time}` : p.start_time) : 'all day'].filter(Boolean).join(' · ') };
    default:
      return { verb: 'Add goal', heading: p.title ?? '', detail: p.target_on ? `by ${formatDay(p.target_on)}, tracked by steps` : 'tracked by steps' };
  }
}

// Which permission accepting an action needs (section 3).
export const actionNeedsGoalsPermission = (type: ActionType) => type === 'create_milestone' || type === 'create_goal';

// ---------------------------------------------------------------------------------------------
// Settings (sections 3 and 13).

export type PlanSettings = { allowStaffAssignment: boolean; weeklySuggestions: boolean; defaultReminderTime: string };
export const DEFAULT_PLAN_SETTINGS: PlanSettings = { allowStaffAssignment: true, weeklySuggestions: false, defaultReminderTime: '08:00' };

// ---------------------------------------------------------------------------------------------
// Links from a task to the records it is about (section 4.3), and goals' related measures (4.2).

export type LinkType = 'sale' | 'expense' | 'product' | 'activity' | 'kpi';
export const LINK_TYPE_LABELS: Record<LinkType, string> = { sale: 'Sale', expense: 'Expense', product: 'Product or service', activity: 'Activity', kpi: 'Measure' };
export type TaskLink = { id: string; type: LinkType; recordId: string | null; kpiCode: string | null; label: string };
export type LinkTarget = { type: LinkType; recordId: string | null; kpiCode: string | null; label: string };

// Records a task can point at. src/composition connects this to the records and operations modules.
export type LinkOption = { id: string; label: string };
export type PlanLinkSource = {
  sales(businessId: string): Promise<LinkOption[]>;
  expenses(businessId: string): Promise<LinkOption[]>;
  products(businessId: string): Promise<LinkOption[]>;
  activities(businessId: string): Promise<LinkOption[]>;
};

export type GoalMeasure = { code: string; name: string; unitKind: string; value: number | null; status: string; note: string | null; periodFrom: string; periodTo: string };

// ---------------------------------------------------------------------------------------------
// Offline capture (section 8). A change made without a connection waits on the device, keyed by
// the person and business, and is sent when the connection returns.

export type OutboxItem =
  | { kind: 'create'; clientId: string; recordedAt: string; input: TaskInput; error: string | null }
  | {
      kind: 'update';
      clientId: string;
      recordedAt: string;
      taskId: string;
      taskTitle: string;
      expectedVersion: number;
      // The task as it was when the change was made, so only the fields this device changed are
      // applied over someone else's newer version.
      base: TaskInput;
      input: TaskInput;
      // Set when someone else changed the task meanwhile: the person chooses what happens.
      conflict: boolean;
      error: string | null;
    };

export type OutboxScope = { userId: string; businessId: string };

export interface PlanOutbox {
  list(scope: OutboxScope): Promise<OutboxItem[]>;
  put(scope: OutboxScope, item: OutboxItem): Promise<void>;
  remove(scope: OutboxScope, clientId: string): Promise<void>;
}

// Section 8: applies only what this device changed on top of the latest version, so keeping a
// completion made offline does not undo someone else's other edits.
export function mergeOntoLatest(base: TaskInput, mine: TaskInput, latest: TaskInput): TaskInput {
  const merged = { ...latest };
  for (const key of Object.keys(mine) as (keyof TaskInput)[]) {
    if (JSON.stringify(mine[key]) !== JSON.stringify(base[key])) (merged as Record<string, unknown>)[key] = mine[key];
  }
  return merged;
}

// What a person sees for a change still on the device.
export function describeOutboxItem(item: OutboxItem): { title: string; detail: string } {
  if (item.kind === 'create') return { title: item.input.title, detail: 'New task, waiting to sync' };
  const status: Record<TaskStatus, string> = { not_started: 'not started', in_progress: 'in progress', blocked: 'blocked', completed: 'completed', cancelled: 'cancelled' };
  return {
    title: item.taskTitle,
    detail: item.conflict ? 'Someone else changed this task. Choose which version to keep.' : `Marked ${status[item.input.status]}, waiting to sync`,
  };
}
