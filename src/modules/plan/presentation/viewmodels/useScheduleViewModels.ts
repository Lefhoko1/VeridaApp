import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { todayIso } from '@/core/format/format';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';
import { useMemberOptions } from '@/modules/business';

import { GOAL_STATUS_LABELS, PRIORITY_LABELS, TASK_STATUS_LABELS, isOpen, type TaskPriority } from '../../domain/models';
import {
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  WEEKDAY_SHORT,
  addDays,
  isoWeekday,
  describeRule,
  groupByDay,
  monthGrid,
  monthTitle,
  reviewFacts,
  scheduleRange,
  scheduleStatusLabel,
  shiftAnchor,
  timeRange,
  weekStart,
  weekdayName,
  type EventInput,
  type EventStatus,
  type ReviewInput,
  type ScheduleItem,
  type ScheduleView,
} from '../../domain/schedule';
import { eventFormSchema, reviewFormSchema, ruleUpdateSchema } from '../../domain/validation';
import { PRIORITY_OPTIONS, goalCard, taskRow, useGoalsWithProgress, usePlanQueries } from './usePlanViewModels';
import { isOffline, usePlanSync } from './usePlanSync';

const options = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

export const SCHEDULE_VIEWS = [
  { value: 'list', label: 'List' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export type ScheduleRow = {
  key: string;
  kind: ScheduleItem['kind'];
  id: string | null;
  ruleId: string | null;
  title: string;
  when: string;
  statusLabel: string;
  closed: boolean;
  overdue: boolean;
  assignee: string | null;
  priority: TaskPriority | null;
  priorityLabel: string | null;
  typeLabel: string | null;
};

// Section 4.4: day, week and month views, and a list that suits a phone. Dates and times are
// the business's own.
export function useScheduleViewModel() {
  const { plan, business, can, scope, enabled } = usePlanQueries();
  const sync = usePlanSync();
  const members = useMemberOptions();
  const today = todayIso();
  const [view, setView] = useState<ScheduleView>('list');
  const [anchor, setAnchor] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);
  const range = scheduleRange(view, anchor);
  const schedule = useQuery({
    queryKey: [...scope, 'schedule', range.from, range.to],
    queryFn: () => plan.schedule(business.id, range),
    enabled,
  });

  const toRow = (item: ScheduleItem, index: number): ScheduleRow => {
    const closed = item.status === 'completed' || item.status === 'cancelled' || item.status === 'done';
    return {
      key: `${item.kind}-${item.id ?? item.ruleId ?? ''}-${item.onDate}-${index}`,
      kind: item.kind,
      id: item.id,
      ruleId: item.ruleId,
      title: item.title,
      when: item.kind === 'event' ? timeRange(item.startTime, item.endTime) : item.kind === 'projected' ? 'Repeating task' : 'Task',
      statusLabel: scheduleStatusLabel(item),
      closed,
      overdue: item.kind === 'task' && !closed && item.onDate < today,
      assignee: members.nameOf(item.assignedTo),
      priority: item.priority,
      priorityLabel: item.priority ? PRIORITY_LABELS[item.priority] : null,
      typeLabel: item.eventType ? EVENT_TYPE_LABELS[item.eventType] : null,
    };
  };

  const items = schedule.data ?? [];
  const days = groupByDay(items).map((group) => ({ day: group.day, weekday: weekdayName(group.day), isToday: group.day === today, rows: group.items.map(toRow) }));
  const countByDay = new Map(days.map((group) => [group.day, group.rows.filter((row) => !row.closed).length]));
  const anchorMonth = anchor.slice(0, 7);
  const weekFrom = weekStart(anchor);

  const title =
    view === 'day'
      ? `${weekdayName(anchor)} ${anchor}`
      : view === 'week'
        ? `Week of ${weekFrom}`
        : view === 'month'
          ? monthTitle(anchor)
          : `${range.from} to ${range.to}`;

  return {
    canView: enabled,
    loading: enabled && schedule.isPending,
    error: schedule.error ? errorMessage(schedule.error) : null,
    retry: () => void schedule.refetch(),
    canCreate: can('plan.tasks'),
    sync,
    view,
    views: SCHEDULE_VIEWS,
    setView(value: string) {
      setView(value as ScheduleView);
      if (value === 'month') setSelectedDay(anchor);
    },
    title,
    today,
    previous: () => setAnchor((current) => shiftAnchor(view, current, -1)),
    next: () => setAnchor((current) => shiftAnchor(view, current, 1)),
    goToToday() {
      setAnchor(today);
      setSelectedDay(today);
    },
    days,
    isEmpty: items.length === 0,
    // Month view: a grid with how many open items each day holds; choosing a day lists them.
    month: monthGrid(anchor).map((week) =>
      week.map((day) => ({ day, label: String(Number(day.slice(8, 10))), inMonth: day.slice(0, 7) === anchorMonth, isToday: day === today, count: countByDay.get(day) ?? 0, selected: day === selectedDay })),
    ),
    selectedDay,
    selectDay: setSelectedDay,
    selectedRows: days.find((group) => group.day === selectedDay)?.rows ?? [],
  };
}

// ---------------------------------------------------------------------------------------------
// Events.

const NEW_EVENT = { title: '', description: '', eventType: 'other', startsOn: '', startTime: '', endTime: '', status: 'scheduled', repeat: 'none', intervalCount: '1', daysOfWeek: '', dayOfMonth: '', endsOn: '' };

type EventFormArgs = { eventId?: string; onDate?: string; onDone: (id: string) => void; onSeriesCreated?: (ruleId: string) => void; onQueued?: () => void };

export function useEventFormViewModel({ eventId, onDate, onDone, onSeriesCreated, onQueued }: EventFormArgs) {
  const { plan, business, can, scope } = usePlanQueries();
  const sync = usePlanSync();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(eventFormSchema, { ...NEW_EVENT, startsOn: onDate ?? todayIso() });
  const { reset } = form;
  const existing = useQuery({ queryKey: [...scope, 'events', eventId], queryFn: () => plan.getEvent(eventId ?? ''), enabled: Boolean(eventId) });

  useEffect(() => {
    const event = existing.data;
    if (!event) return;
    reset({
      ...NEW_EVENT,
      title: event.title,
      description: event.description ?? '',
      eventType: event.eventType,
      startsOn: event.startsOn,
      startTime: event.startTime ?? '',
      endTime: event.endTime ?? '',
      status: event.status,
    });
  }, [existing.data, reset]);

  type Output = NonNullable<ReturnType<typeof form.validate>>;
  const save = useMutation({
    mutationFn: async (value: Output): Promise<{ kind: 'event' | 'series'; id: string }> => {
      const input: EventInput = { title: value.title, description: value.description, eventType: value.eventType, startsOn: value.startsOn, startTime: value.startTime, endTime: value.endTime, status: value.status };
      if (!eventId && value.repeat !== 'none') {
        const id = await plan.createEventRule(business.id, {
          title: value.title,
          description: value.description,
          eventType: value.eventType,
          startTime: value.startTime,
          endTime: value.endTime,
          frequency: value.repeat,
          intervalCount: value.intervalCount,
          daysOfWeek: value.daysOfWeek,
          dayOfMonth: value.dayOfMonth,
          startsOn: value.startsOn,
          endsOn: value.endsOn,
        });
        return { kind: 'series', id };
      }
      return { kind: 'event', id: eventId ? await plan.updateEvent(eventId, input).then(() => eventId) : await plan.createEvent(business.id, input) };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: scope });
      if (result.kind === 'series') {
        feedback.success('Repeating event added to the schedule.');
        if (onSeriesCreated) onSeriesCreated(result.id);
        return;
      }
      feedback.success(eventId ? 'Event updated.' : 'Event added to the schedule.');
      onDone(result.id);
    },
    onError: async (error, value) => {
      // Section 8: a one-off event made without a connection waits on this device.
      if (isOffline(error) && !eventId && value.repeat === 'none') {
        await sync.enqueueEvent({ title: value.title, description: value.description, eventType: value.eventType, startsOn: value.startsOn, startTime: value.startTime, endTime: value.endTime, status: value.status });
        feedback.success('No connection. Saved on this device; it will sync when you are back online.');
        if (onQueued) onQueued();
        return;
      }
      feedback.error(errorMessage(error));
    },
  });

  return {
    isEditing: Boolean(eventId),
    loading: Boolean(eventId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    form,
    canSave: can('plan.tasks'),
    saving: save.isPending,
    typeOptions: options(EVENT_TYPE_LABELS),
    statusOptions: options(EVENT_STATUS_LABELS),
    // Section 4.4: a new event can repeat, such as a weekly market day.
    canRepeat: !eventId && Boolean(onSeriesCreated),
    repeatOptions: [
      { value: 'none', label: 'Does not repeat' },
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' },
    ],
    weekdayOptions: WEEKDAY_SHORT.map((label, index) => ({ value: String(index + 1), label })),
    chosenWeekdays: form.values.daysOfWeek.split(',').filter(Boolean),
    setWeekdays: (days: string[]) => form.setValue('daysOfWeek', days.sort().join(',')),
    setRepeat(value: string) {
      form.setValue('repeat', value);
      const start = form.values.startsOn || todayIso();
      if (value === 'weekly' && !form.values.daysOfWeek) form.setValue('daysOfWeek', String(isoWeekday(start)));
      if (value === 'monthly' && !form.values.dayOfMonth) form.setValue('dayOfMonth', String(Number(start.slice(8, 10))));
    },
    repeatSummary:
      form.values.repeat !== 'none'
        ? describeRule({
            frequency: form.values.repeat as 'daily' | 'weekly' | 'monthly',
            intervalCount: Number(form.values.intervalCount) || 1,
            daysOfWeek: form.values.daysOfWeek.split(',').filter(Boolean).map(Number),
            dayOfMonth: Number(form.values.dayOfMonth) || 1,
          })
        : null,
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}

export function useEventDetailViewModel(eventId: string) {
  const { plan, can, scope } = usePlanQueries();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const event = useQuery({ queryKey: [...scope, 'events', eventId], queryFn: () => plan.getEvent(eventId) });
  const setStatus = useMutation({
    mutationFn: (status: EventStatus) => {
      const current = event.data;
      if (!current) throw new Error('Event not loaded.');
      const { id: _id, version: _version, ruleId: _ruleId, ...rest } = current;
      return plan.updateEvent(eventId, { ...rest, status });
    },
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success(`Marked as ${EVENT_STATUS_LABELS[status].toLowerCase()}.`);
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });
  const current = event.data;
  const canEdit = can('plan.tasks');
  return {
    loading: event.isPending,
    error: event.error ? errorMessage(event.error) : null,
    event: current ?? null,
    typeLabel: current ? EVENT_TYPE_LABELS[current.eventType] : '',
    statusLabel: current ? EVENT_STATUS_LABELS[current.status] : '',
    when: current ? timeRange(current.startTime, current.endTime) : '',
    canEdit,
    busy: setStatus.isPending,
    canMarkDone: canEdit && current?.status === 'scheduled',
    canCancel: canEdit && current?.status === 'scheduled',
    canRestore: canEdit && current !== undefined && current.status !== 'scheduled',
    markDone: () => setStatus.mutate('done'),
    cancel: () => setStatus.mutate('cancelled'),
    restore: () => setStatus.mutate('scheduled'),
  };
}

// ---------------------------------------------------------------------------------------------
// Repeating series.

export function useSeriesDetailViewModel(ruleId: string) {
  const { plan, can, scope } = usePlanQueries();
  const members = useMemberOptions();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const rule = useQuery({ queryKey: [...scope, 'series', ruleId], queryFn: () => plan.getRule(ruleId) });
  const occurrences = useQuery({ queryKey: [...scope, 'series', ruleId, 'occurrences'], queryFn: () => plan.listOccurrences(ruleId) });
  const eventOccurrences = useQuery({ queryKey: [...scope, 'series', ruleId, 'events'], queryFn: () => plan.listEventOccurrences(ruleId), enabled: rule.data?.kind === 'event' });
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const end = useMutation({
    mutationFn: () => plan.endRule(ruleId),
    onSuccess: async () => {
      setConfirmingEnd(false);
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('The task will no longer repeat.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });
  const current = rule.data;
  const today = todayIso();
  const list = occurrences.data ?? [];
  return {
    loading: rule.isPending,
    error: rule.error ? errorMessage(rule.error) : null,
    rule: current ?? null,
    summary: current ? describeRule(current) : '',
    priorityLabel: current ? PRIORITY_LABELS[current.priority] : '',
    assignee: members.nameOf(current?.assignedTo ?? null),
    active: current?.status === 'active',
    canManage: can('plan.tasks') && current?.status === 'active',
    upcoming: list
      .filter((task) => isOpen(task) && (task.dueOn ?? '') >= today)
      .reverse()
      .map((task) => taskRow(task, today, members.nameOf)),
    past: list.filter((task) => !isOpen(task) || (task.dueOn ?? '') < today).map((task) => taskRow(task, today, members.nameOf)),
    // An event series shows its events instead of tasks.
    isEventSeries: current?.kind === 'event',
    eventWhen: current ? timeRange(current.startTime, current.endTime) : '',
    events: (eventOccurrences.data ?? [])
      .slice()
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
      .map((event) => ({ id: event.id, title: event.title, startsOn: event.startsOn, when: timeRange(event.startTime, event.endTime), statusLabel: EVENT_STATUS_LABELS[event.status], past: event.startsOn < today })),
    confirmingEnd,
    askToEnd: () => setConfirmingEnd(true),
    cancelEnd: () => setConfirmingEnd(false),
    ending: end.isPending,
    confirmEnd: () => end.mutate(),
  };
}

export function useSeriesFormViewModel({ ruleId, onDone }: { ruleId: string; onDone: () => void }) {
  const { plan, can, scope } = usePlanQueries();
  const members = useMemberOptions();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(ruleUpdateSchema, { title: '', description: '', priority: 'normal', assignedTo: '', endsOn: '', startsOn: '' });
  const { reset } = form;
  const rule = useQuery({ queryKey: [...scope, 'series', ruleId], queryFn: () => plan.getRule(ruleId) });

  useEffect(() => {
    const current = rule.data;
    if (!current) return;
    reset({
      title: current.title,
      description: current.description ?? '',
      priority: current.priority,
      assignedTo: current.assignedTo ?? '',
      endsOn: current.endsOn ?? '',
      startsOn: current.startsOn,
    });
  }, [rule.data, reset]);

  const save = useMutation({
    mutationFn: (input: { title: string; description: string | null; priority: TaskPriority; assignedTo: string | null; endsOn: string | null }) => plan.updateRule(ruleId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Series updated. Later tasks that nobody changed on their own now match.');
      onDone();
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    loading: rule.isPending,
    loadError: rule.error ? errorMessage(rule.error) : null,
    form,
    summary: rule.data ? describeRule(rule.data) : '',
    isEventSeries: rule.data?.kind === 'event',
    canSave: can('plan.tasks') && rule.data?.status === 'active',
    saving: save.isPending,
    priorityOptions: PRIORITY_OPTIONS,
    assigneeOptions: [{ value: '', label: 'Nobody yet' }, ...members.options],
    submit() {
      const value = form.validate();
      if (value) save.mutate(value);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Progress and weekly reviews (section 4.5).

export type ProgressPeriod = 'week' | 'month';
const PERIOD_OPTIONS = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
];

export function useProgressViewModel() {
  const { plan, business, can, scope, goals, enabled } = usePlanQueries();
  const [period, setPeriod] = useState<ProgressPeriod>('week');
  const today = todayIso();
  const from = addDays(today, period === 'week' ? -6 : -29);
  const overview = useQuery({ queryKey: [...scope, 'overview', period], queryFn: () => plan.overview(business.id, { from, to: today }), enabled });
  const reviews = useQuery({ queryKey: [...scope, 'reviews'], queryFn: () => plan.listReviews(business.id), enabled });
  const tracked = (goals.data ?? []).filter((goal) => goal.status !== 'cancelled');
  const withProgress = useGoalsWithProgress(tracked, scope);
  const businessToday = overview.data?.today ?? today;
  const thisWeek = weekStart(businessToday);
  const lastWeek = addDays(thisWeek, -7);
  const written = new Set((reviews.data ?? []).map((review) => review.periodStart));

  return {
    canView: enabled,
    loading: enabled && overview.isPending,
    error: overview.error ? errorMessage(overview.error) : null,
    retry: () => void overview.refetch(),
    period,
    periodOptions: PERIOD_OPTIONS,
    setPeriod: (value: string) => setPeriod(value as ProgressPeriod),
    periodLabel: period === 'week' ? 'Last 7 days' : 'Last 30 days',
    numbers: overview.data ?? null,
    goals: withProgress.map((goal) => ({ ...goalCard(goal), statusLabel: GOAL_STATUS_LABELS[goal.status] })),
    // The week just finished is the one most worth reviewing; this week can be started early.
    reviewWeeks: [
      { start: lastWeek, label: 'Last week', written: written.has(lastWeek) },
      { start: thisWeek, label: 'This week', written: written.has(thisWeek) },
    ],
    canWriteReview: can('plan.goals'),
    reviews: (reviews.data ?? []).map((review) => ({
      start: review.periodStart,
      end: review.periodEnd,
      preview: review.summary ?? review.wins ?? review.nextPriorities ?? 'No notes yet.',
    })),
  };
}

// One week's review: what the tasks show, the team's measures for the week, and the notes.
export function useReviewViewModel(periodStart: string) {
  const { plan, business, can, scope, tasks, enabled } = usePlanQueries();
  const members = useMemberOptions();
  const start = weekStart(periodStart);
  const end = addDays(start, 6);
  const review = useQuery({ queryKey: [...scope, 'reviews', start], queryFn: () => plan.getReview(business.id, start), enabled });
  const numbers = useQuery({ queryKey: [...scope, 'overview', start, end], queryFn: () => plan.overview(business.id, { from: start, to: end }), enabled });
  const today = todayIso();
  const facts = reviewFacts(tasks.data ?? [], start, end);
  const rows = (list: typeof facts.completed) => list.map((task) => taskRow(task, today, members.nameOf));

  return {
    loading: enabled && (review.isPending || tasks.isPending),
    error: review.error ? errorMessage(review.error) : tasks.error ? errorMessage(tasks.error) : null,
    start,
    end,
    review: review.data ?? null,
    numbers: numbers.data ?? null,
    completed: rows(facts.completed),
    unfinished: rows(facts.unfinished),
    blocked: rows(facts.blocked),
    upcoming: rows(facts.upcoming),
    canEdit: can('plan.goals'),
    canAddTask: can('plan.tasks'),
    statusName: (status: keyof typeof TASK_STATUS_LABELS) => TASK_STATUS_LABELS[status],
  };
}

export function useReviewFormViewModel({ periodStart, onDone }: { periodStart: string; onDone: () => void }) {
  const { plan, business, can, scope } = usePlanQueries();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const start = weekStart(periodStart);
  const end = addDays(start, 6);
  const form = useForm(reviewFormSchema, { summary: '', wins: '', blockers: '', nextPriorities: '' });
  const { reset } = form;
  const review = useQuery({ queryKey: [...scope, 'reviews', start], queryFn: () => plan.getReview(business.id, start) });

  useEffect(() => {
    const current = review.data;
    if (!current) return;
    reset({ summary: current.summary ?? '', wins: current.wins ?? '', blockers: current.blockers ?? '', nextPriorities: current.nextPriorities ?? '' });
  }, [review.data, reset]);

  const save = useMutation({
    mutationFn: (input: ReviewInput) => plan.saveReview(business.id, { from: start, to: end }, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Review saved.');
      onDone();
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    loading: review.isPending,
    loadError: review.error ? errorMessage(review.error) : null,
    start,
    end,
    form,
    canSave: can('plan.goals'),
    saving: save.isPending,
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}
