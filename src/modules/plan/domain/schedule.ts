// Plan Module Developer Specification v1.0, P1: the schedule, repeating tasks, events,
// reminders, comments, task history and weekly reviews. Plain TypeScript, no React or Supabase.

import { TASK_STATUS_LABELS, PRIORITY_LABELS, isOpen, type Task, type TaskPriority, type TaskStatus } from './models';

// ---------------------------------------------------------------------------------------------
// Dates. Business days are YYYY-MM-DD strings, so arithmetic happens in UTC where no daylight
// saving or time zone can move them.

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function addMonths(iso: string, months: number): string {
  const date = toDate(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return toIso(date);
}

// ISO weekday: 1 is Monday and 7 is Sunday.
export function isoWeekday(iso: string): number {
  const day = toDate(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

// Weeks start on Monday.
export const weekStart = (iso: string) => addDays(iso, 1 - isoWeekday(iso));
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
export const monthEnd = (iso: string) => addDays(addMonths(monthStart(iso), 1), -1);

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthTitle = (iso: string) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`;
export const weekdayName = (iso: string) => WEEKDAY_SHORT[isoWeekday(iso) - 1] ?? '';

// The weeks shown for a month, Monday to Sunday, including the days around it.
export function monthGrid(iso: string): string[][] {
  const first = weekStart(monthStart(iso));
  const last = addDays(weekStart(monthEnd(iso)), 6);
  const weeks: string[][] = [];
  for (let day = first; day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(day, index)));
  }
  return weeks;
}

export type ScheduleView = 'list' | 'day' | 'week' | 'month';

// Section 4.4: the period each view covers, around a chosen day.
export function scheduleRange(view: ScheduleView, anchor: string): { from: string; to: string } {
  switch (view) {
    case 'day':
      return { from: anchor, to: anchor };
    case 'week':
      return { from: weekStart(anchor), to: addDays(weekStart(anchor), 6) };
    case 'month': {
      const grid = monthGrid(anchor);
      return { from: grid[0]?.[0] ?? anchor, to: grid[grid.length - 1]?.[6] ?? anchor };
    }
    default:
      return { from: anchor, to: addDays(anchor, 13) };
  }
}

export function shiftAnchor(view: ScheduleView, anchor: string, step: -1 | 1): string {
  switch (view) {
    case 'day':
      return addDays(anchor, step);
    case 'week':
      return addDays(anchor, 7 * step);
    case 'month':
      return addMonths(anchor, step);
    default:
      return addDays(anchor, 14 * step);
  }
}

// ---------------------------------------------------------------------------------------------
// Repeating tasks (entity RECURRING_RULE).

export type Frequency = 'daily' | 'weekly' | 'monthly';

export type RecurringRule = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  assignedTo: string | null;
  frequency: Frequency;
  intervalCount: number;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  startsOn: string;
  endsOn: string | null;
  status: 'active' | 'ended';
  kind: 'task' | 'event';
  eventType: EventType | null;
  startTime: string | null;
  endTime: string | null;
};

export type RuleInput = Omit<RecurringRule, 'id' | 'status' | 'kind' | 'eventType' | 'startTime' | 'endTime'>;

// Section 4.4: a repeating event, such as a weekly market day.
export type EventRuleInput = Pick<RecurringRule, 'title' | 'description' | 'frequency' | 'intervalCount' | 'daysOfWeek' | 'dayOfMonth' | 'startsOn' | 'endsOn'> & {
  eventType: EventType;
  startTime: string | null;
  endTime: string | null;
};
// What can change once a series exists. A different pattern is a new series.
export type RuleUpdate = Pick<RecurringRule, 'title' | 'description' | 'priority' | 'assignedTo' | 'endsOn'>;

export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export function describeRule(rule: Pick<RecurringRule, 'frequency' | 'intervalCount' | 'daysOfWeek' | 'dayOfMonth'>): string {
  const every = (unit: string) => (rule.intervalCount === 1 ? `Every ${unit}` : `Every ${rule.intervalCount} ${unit}s`);
  switch (rule.frequency) {
    case 'daily':
      return every('day');
    case 'weekly': {
      const days = [...rule.daysOfWeek].sort((a, b) => a - b);
      const names = days.length === 7 ? 'every day' : days.length === 5 && days.every((d, i) => d === i + 1) ? 'weekdays' : days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
      return `${every('week')} on ${names}`;
    }
    default:
      return `${every('month')} on the ${ordinal(rule.dayOfMonth ?? 1)}${(rule.dayOfMonth ?? 0) > 28 ? ' (or the last day)' : ''}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Events (entity PLAN_EVENT).

export type EventType = 'meeting' | 'delivery' | 'appointment' | 'deadline' | 'other';
export type EventStatus = 'scheduled' | 'done' | 'cancelled';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  meeting: 'Meeting',
  delivery: 'Delivery',
  appointment: 'Appointment',
  deadline: 'Deadline',
  other: 'Other',
};
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = { scheduled: 'Scheduled', done: 'Done', cancelled: 'Cancelled' };

export type PlanEvent = {
  id: string;
  title: string;
  description: string | null;
  eventType: EventType;
  startsOn: string;
  // Local times as HH:MM, in the business's time zone.
  startTime: string | null;
  endTime: string | null;
  status: EventStatus;
  version: number;
  // Set when the event is one occurrence of a repeating series.
  ruleId: string | null;
};

export type EventInput = Omit<PlanEvent, 'id' | 'version' | 'ruleId'>;

export const timeRange = (start: string | null, end: string | null) => (start ? (end ? `${start}–${end}` : start) : 'All day');

// ---------------------------------------------------------------------------------------------
// The schedule (section 4.4). Projected items are occurrences a series will produce later.

export type ScheduleItem = {
  kind: 'task' | 'event' | 'projected';
  id: string | null;
  ruleId: string | null;
  title: string;
  onDate: string;
  startTime: string | null;
  endTime: string | null;
  status: TaskStatus | EventStatus;
  priority: TaskPriority | null;
  assignedTo: string | null;
  eventType: EventType | null;
};

export function scheduleStatusLabel(item: Pick<ScheduleItem, 'kind' | 'status'>): string {
  if (item.kind === 'projected') return 'Repeats';
  if (item.kind === 'event') return EVENT_STATUS_LABELS[item.status as EventStatus] ?? '';
  return TASK_STATUS_LABELS[item.status as TaskStatus] ?? '';
}

export function groupByDay<T extends { onDate: string }>(items: T[]): { day: string; items: T[] }[] {
  const days = new Map<string, T[]>();
  for (const item of items) days.set(item.onDate, [...(days.get(item.onDate) ?? []), item]);
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, items: list }));
}

// ---------------------------------------------------------------------------------------------
// Reminders (section 9).

export type ReminderStatus = 'pending' | 'sent' | 'dismissed' | 'skipped' | 'cancelled';
export type Reminder = { id: string; remindAt: string; status: ReminderStatus; sentAt: string | null };

// Section 9: never promise delivery. A pending reminder well past its time is shown as missed.
export function reminderState(reminder: Reminder, now: Date): { label: string; tone: 'ok' | 'warn' | 'neutral' } {
  switch (reminder.status) {
    case 'sent':
      return { label: 'Sent', tone: 'ok' };
    case 'dismissed':
      return { label: 'Dismissed', tone: 'neutral' };
    case 'skipped':
      return { label: 'Not sent: task reminders are off', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Not needed: the task closed', tone: 'neutral' };
    default:
      return new Date(reminder.remindAt).getTime() < now.getTime() - 15 * 60 * 1000 ? { label: 'Waiting to be sent', tone: 'warn' } : { label: 'Pending', tone: 'neutral' };
  }
}

// ---------------------------------------------------------------------------------------------
// Comments and history (section 4.3).

export type TaskComment = { id: string; authorId: string; body: string; createdAt: string; editedAt: string | null };

export type FieldChange = { from: unknown; to: unknown };
export type TaskHistoryEntry = { occurredAt: string; action: 'INSERT' | 'UPDATE' | 'DELETE'; actorName: string | null; changes: Record<string, FieldChange> };

const FIELD_NAMES: Record<string, string> = {
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  due_on: 'Due date',
  assigned_to: 'Assigned to',
  blocker_reason: 'Blocker',
  completion_note: 'Completion note',
  description: 'Details',
};

// Plain words for one entry, with names for people and labels for codes.
export function describeChanges(entry: TaskHistoryEntry, nameOf: (id: string | null) => string | null, formatDay: (iso: string) => string): string[] {
  if (entry.action === 'INSERT') return ['Created the task'];
  const show = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return 'none';
    const text = String(value);
    if (field === 'status') return TASK_STATUS_LABELS[text as TaskStatus] ?? text;
    if (field === 'priority') return PRIORITY_LABELS[text as TaskPriority] ?? text;
    if (field === 'due_on') return formatDay(text);
    if (field === 'assigned_to') return nameOf(text) ?? 'someone';
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  };
  return Object.entries(entry.changes)
    .filter(([field]) => FIELD_NAMES[field])
    .map(([field, change]) => (field === 'description' ? 'Changed the details' : `${FIELD_NAMES[field]}: ${show(field, change.from)} → ${show(field, change.to)}`));
}

// ---------------------------------------------------------------------------------------------
// Weekly reviews (section 4.5).

export type PlanReview = {
  id: string;
  periodStart: string;
  periodEnd: string;
  summary: string | null;
  wins: string | null;
  blockers: string | null;
  nextPriorities: string | null;
  updatedAt: string;
};

export type ReviewInput = Pick<PlanReview, 'summary' | 'wins' | 'blockers' | 'nextPriorities'>;

// What happened in a week, read from the tasks. This sorts and filters; it calculates no figure.
export function reviewFacts(tasks: Task[], from: string, to: string) {
  const nextFrom = addDays(to, 1);
  const nextTo = addDays(to, 7);
  return {
    completed: tasks.filter((task) => task.completedOn !== null && task.completedOn >= from && task.completedOn <= to),
    unfinished: tasks.filter((task) => isOpen(task) && task.dueOn !== null && task.dueOn <= to),
    blocked: tasks.filter((task) => task.status === 'blocked'),
    upcoming: tasks.filter((task) => isOpen(task) && task.dueOn !== null && task.dueOn >= nextFrom && task.dueOn <= nextTo),
  };
}
