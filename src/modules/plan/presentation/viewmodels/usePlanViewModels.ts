import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { AppError, errorMessage } from '@/core/errors/AppError';
import { formatDate as formatDay, todayIso } from '@/core/format/format';
import { useForm } from '@/core/forms/useForm';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness, useMemberOptions } from '@/modules/business';

import {
  DIRECTION_LABELS,
  GOAL_STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  describeProgress,
  focusOrder,
  isOpen,
  isOverdue,
  type Goal,
  type GoalInput,
  type GoalStatus,
  type GoalWithProgress,
  type Task,
  type TaskInput,
  type TaskStatus,
} from '../../domain/models';
import { EVENT_TYPE_LABELS, WEEKDAY_SHORT, addDays, describeChanges, describeRule, isoWeekday, reminderState, timeRange, type RuleInput } from '../../domain/schedule';
import { commentFormSchema, goalFormSchema, milestoneFormSchema, progressFormSchema, reminderFormSchema, ruleFields, taskFormSchema } from '../../domain/validation';
import { usePlanDependencies } from '../di';

const daysFrom = addDays;

const options = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
export const PRIORITY_OPTIONS = options(PRIORITY_LABELS);
export const TASK_STATUS_OPTIONS = options(TASK_STATUS_LABELS);
export const GOAL_STATUS_OPTIONS = options(GOAL_STATUS_LABELS);
export const DIRECTION_OPTIONS = options(DIRECTION_LABELS);

export function usePlanQueries() {
  const { plan } = usePlanDependencies();
  const { business, userId, can } = useActiveBusiness();
  const scope = [...businessScope(business.id), 'plan'];
  const enabled = can('plan.view');
  const tasks = useQuery({ queryKey: [...scope, 'tasks'], queryFn: () => plan.listTasks(business.id), enabled });
  const goals = useQuery({ queryKey: [...scope, 'goals'], queryFn: () => plan.listGoals(business.id), enabled });
  return { plan, business, userId, can, scope, tasks, goals, enabled };
}

// Each goal's progress comes from the backend (section 7.1). Plan never calculates it here.
export function useGoalsWithProgress(goals: Goal[], scope: unknown[]) {
  const { plan } = usePlanDependencies();
  const progress = useQueries({
    queries: goals.map((goal) => ({ queryKey: [...scope, 'goals', goal.id, 'progress'], queryFn: () => plan.goalProgress(goal.id) })),
  });
  return goals.flatMap((goal, index): GoalWithProgress[] => {
    const result = progress[index]?.data;
    return result ? [{ ...goal, progress: result }] : [];
  });
}

export const goalCard = (goal: GoalWithProgress) => ({
  id: goal.id,
  title: goal.title,
  status: goal.status,
  statusLabel: GOAL_STATUS_LABELS[goal.status],
  summary: describeProgress(goal, goal.progress),
  // A bar only where the backend gave a percentage, capped for drawing but not in the words.
  ratio: goal.progress.percent === null ? null : Math.max(0, Math.min(1, goal.progress.percent / 100)),
  targetOn: goal.targetOn,
  milestones: goal.goalType === 'milestone' ? `${goal.progress.milestonesDone} of ${goal.progress.milestonesTotal}` : null,
});

export const taskRow = (task: Task, today: string, nameOf: (id: string | null) => string | null) => ({
  id: task.id,
  title: task.title,
  priority: task.priority,
  priorityLabel: PRIORITY_LABELS[task.priority],
  status: task.status,
  statusLabel: TASK_STATUS_LABELS[task.status],
  dueOn: task.dueOn,
  overdue: isOverdue(task, today),
  dueToday: task.dueOn === today && isOpen(task),
  assignee: nameOf(task.assignedTo),
});

export type PlanPeriod = 'week' | 'month';

export const PLAN_SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'goals', label: 'Goals' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'progress', label: 'Progress' },
] as const;
export type PlanSection = (typeof PLAN_SECTIONS)[number]['value'];

// The Plan tab itself. Opening it brings repeating tasks up to date, which is safe to repeat:
// the database never creates an occurrence twice (section 6.2).
export function usePlanSectionsViewModel(initial: PlanSection = 'overview') {
  const { plan, business, enabled } = usePlanQueries();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<PlanSection>(initial);
  const businessId = business.id;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    plan
      .generateOccurrences(businessId)
      .then((created) => {
        if (live && created > 0) void queryClient.invalidateQueries({ queryKey: [...businessScope(businessId), 'plan'] });
      })
      // The schedule still shows what a series will produce, so a failure here loses nothing.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [plan, businessId, enabled, queryClient]);

  return { section, setSection: (value: string) => setSection(value as PlanSection), sections: PLAN_SECTIONS };
}

// Section 4.1: today's focus, counts, active goals and upcoming work.
export function usePlanOverviewViewModel() {
  const { plan, business, can, scope, tasks, goals, enabled } = usePlanQueries();
  const members = useMemberOptions();
  const today = todayIso();
  const overview = useQuery({
    queryKey: [...scope, 'overview', 'week'],
    queryFn: () => plan.overview(business.id, { from: daysFrom(today, -6), to: today }),
    enabled,
  });
  // The business's own "today", from its time zone, once the overview has loaded.
  const businessToday = overview.data?.today ?? today;
  const weekAhead = daysFrom(businessToday, 7);
  const coming = useQuery({
    queryKey: [...scope, 'schedule', businessToday, weekAhead],
    queryFn: () => plan.schedule(business.id, { from: businessToday, to: weekAhead }),
    enabled,
  });
  const activeGoals = (goals.data ?? []).filter((goal) => goal.status === 'active' || goal.status === 'at_risk');
  const withProgress = useGoalsWithProgress(activeGoals, scope);
  const open = (tasks.data ?? []).filter(isOpen);

  return {
    canView: enabled,
    loading: enabled && (overview.isPending || tasks.isPending || goals.isPending),
    error: overview.error ? errorMessage(overview.error) : tasks.error ? errorMessage(tasks.error) : null,
    retry() {
      void overview.refetch();
      void tasks.refetch();
      void goals.refetch();
    },
    canCreateTask: can('plan.tasks'),
    canCreateGoal: can('plan.goals'),
    numbers: overview.data ?? null,
    focus: focusOrder(open, businessToday)
      .filter((task) => task.dueOn === null || task.dueOn <= businessToday)
      .slice(0, 6)
      .map((task) => taskRow(task, businessToday, members.nameOf)),
    upcoming: focusOrder(open, businessToday)
      .filter((task) => task.dueOn !== null && task.dueOn > businessToday && task.dueOn <= weekAhead)
      .slice(0, 6)
      .map((task) => taskRow(task, businessToday, members.nameOf)),
    events: (coming.data ?? [])
      .filter((item) => item.kind === 'event' && item.status === 'scheduled' && item.id !== null)
      .slice(0, 5)
      .map((item) => ({
        id: item.id ?? '',
        title: item.title,
        onDate: item.onDate,
        when: timeRange(item.startTime, item.endTime),
        typeLabel: item.eventType ? EVENT_TYPE_LABELS[item.eventType] : '',
      })),
    goals: withProgress.slice(0, 4).map(goalCard),
  };
}

export type TaskFilter = 'open' | 'completed' | 'cancelled' | 'all';

export function useTaskListViewModel() {
  const { can, tasks, enabled } = usePlanQueries();
  const members = useMemberOptions();
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [search, setSearch] = useState('');
  const today = todayIso();
  const term = search.trim().toLowerCase();

  const items = (tasks.data ?? [])
    .filter((task) => (filter === 'all' ? true : filter === 'open' ? isOpen(task) : task.status === filter))
    .filter((task) => !priority || task.priority === priority)
    .filter((task) => !assignee || task.assignedTo === assignee)
    .filter((task) => !term || task.title.toLowerCase().includes(term) || (task.description ?? '').toLowerCase().includes(term));

  return {
    loading: enabled && tasks.isPending,
    error: tasks.error ? errorMessage(tasks.error) : null,
    retry: () => void tasks.refetch(),
    canCreate: can('plan.tasks'),
    filter,
    setFilter: (value: string) => setFilter(value as TaskFilter),
    priority,
    setPriority,
    assignee,
    setAssignee,
    search,
    setSearch,
    priorityOptions: [{ value: '', label: 'Any priority' }, ...PRIORITY_OPTIONS],
    assigneeOptions: [{ value: '', label: 'Anyone' }, ...members.options],
    items: (filter === 'open' ? focusOrder(items, today) : items).map((task) => taskRow(task, today, members.nameOf)),
  };
}

export function useGoalListViewModel() {
  const { can, scope, goals, enabled } = usePlanQueries();
  const [showClosed, setShowClosed] = useState(false);
  const list = (goals.data ?? []).filter((goal) => showClosed || !['completed', 'cancelled', 'expired'].includes(goal.status));
  const withProgress = useGoalsWithProgress(list, scope);
  return {
    loading: enabled && goals.isPending,
    error: goals.error ? errorMessage(goals.error) : null,
    retry: () => void goals.refetch(),
    canCreate: can('plan.goals'),
    showClosed,
    toggleClosed: () => setShowClosed((value) => !value),
    items: withProgress.map(goalCard),
  };
}

const NEW_TASK = {
  title: '',
  description: '',
  priority: 'normal',
  status: 'not_started',
  dueOn: '',
  completionNote: '',
  blockerReason: '',
  assignedTo: '',
  goalIds: '',
  ...ruleFields.defaults,
};

const REPEAT_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];
export const WEEKDAY_OPTIONS = WEEKDAY_SHORT.map((label, index) => ({ value: String(index + 1), label }));

export type EditScope = 'one' | 'series';

type TaskFormArgs = { taskId?: string; goalId?: string; onDone: (id: string) => void; onSeriesCreated?: (ruleId: string) => void };

export function useTaskFormViewModel({ taskId, goalId, onDone, onSeriesCreated }: TaskFormArgs) {
  const { plan, business, can, scope, goals } = usePlanQueries();
  const members = useMemberOptions();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(taskFormSchema, { ...NEW_TASK, goalIds: goalId ?? '', startsOn: todayIso() });
  const { reset } = form;
  const [editScope, setEditScope] = useState<EditScope>('one');
  const existing = useQuery({ queryKey: [...scope, 'tasks', taskId], queryFn: () => plan.getTask(taskId ?? ''), enabled: Boolean(taskId) });
  const ruleId = existing.data?.ruleId ?? null;
  const rule = useQuery({ queryKey: [...scope, 'series', ruleId], queryFn: () => plan.getRule(ruleId ?? ''), enabled: Boolean(ruleId) });

  useEffect(() => {
    const task = existing.data;
    if (!task) return;
    reset({
      ...NEW_TASK,
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      status: task.status,
      dueOn: task.dueOn ?? '',
      completionNote: task.completionNote ?? '',
      blockerReason: task.blockerReason ?? '',
      assignedTo: task.assignedTo ?? '',
      goalIds: task.goalIds.join(','),
    });
  }, [existing.data, reset]);

  type Output = NonNullable<ReturnType<typeof form.validate>>;
  const toInput = (value: Output): TaskInput => ({
    title: value.title,
    description: value.description,
    priority: value.priority,
    status: value.status,
    dueOn: value.dueOn,
    completionNote: value.completionNote,
    blockerReason: value.blockerReason,
    assignedTo: value.assignedTo,
    goalIds: value.goalIds,
  });

  const save = useMutation({
    mutationFn: async (value: Output): Promise<{ kind: 'task' | 'series'; id: string }> => {
      if (!taskId && value.repeat !== 'none') {
        const input: RuleInput = {
          title: value.title,
          description: value.description,
          priority: value.priority,
          assignedTo: value.assignedTo,
          frequency: value.repeat,
          intervalCount: value.intervalCount,
          daysOfWeek: value.daysOfWeek,
          dayOfMonth: value.dayOfMonth,
          startsOn: value.startsOn ?? todayIso(),
          endsOn: value.endsOn,
        };
        return { kind: 'series', id: await plan.createRule(business.id, input) };
      }
      if (!taskId) return { kind: 'task', id: await plan.createTask(business.id, toInput(value)) };

      const loaded = existing.data;
      if (!loaded) throw new Error('Task not loaded.');
      if (editScope === 'series' && loaded.ruleId && rule.data) {
        // Section 4.4: the series changes first, then this occurrence's own details. A change
        // made meanwhile elsewhere still stops the save.
        const latest = await plan.getTask(taskId);
        if (latest.version !== loaded.version) throw new AppError('conflict', 'Someone changed this task while you were working on it. Nothing was saved. Open it again to see the latest version.');
        await plan.updateRule(loaded.ruleId, { title: value.title, description: value.description, priority: value.priority, assignedTo: value.assignedTo, endsOn: rule.data.endsOn });
        const refreshed = await plan.getTask(taskId);
        await plan.updateTask(business.id, taskId, toInput(value), refreshed.version);
        return { kind: 'task', id: taskId };
      }
      await plan.updateTask(business.id, taskId, toInput(value), loaded.version);
      return { kind: 'task', id: taskId };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: scope });
      if (result.kind === 'series') {
        feedback.success('Repeating task added.');
        if (onSeriesCreated) onSeriesCreated(result.id);
        return;
      }
      feedback.success(taskId ? (editScope === 'series' ? 'This and later tasks updated.' : 'Task updated.') : 'Task added.');
      onDone(result.id);
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const chosenGoals = form.values.goalIds.split(',').filter(Boolean);
  const openGoals = (goals.data ?? []).filter((goal) => !['completed', 'cancelled', 'expired'].includes(goal.status) || chosenGoals.includes(goal.id));
  const repeating = !taskId && form.values.repeat !== 'none';

  return {
    isEditing: Boolean(taskId),
    loading: Boolean(taskId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    form,
    canSave: can('plan.tasks'),
    saving: save.isPending,
    priorityOptions: PRIORITY_OPTIONS,
    statusOptions: TASK_STATUS_OPTIONS,
    assigneeOptions: [{ value: '', label: 'Nobody yet' }, ...members.options],
    goalOptions: openGoals.map((goal) => ({ value: goal.id, label: goal.title })),
    chosenGoals,
    setGoals: (ids: string[]) => form.setValue('goalIds', ids.join(',')),
    // Section 4.4: a new task can repeat. An existing one keeps how it was made.
    // Goals are linked task by task, so a task started from a goal does not repeat.
    canRepeat: !taskId && Boolean(onSeriesCreated) && !goalId,
    repeating,
    repeatOptions: REPEAT_OPTIONS,
    weekdayOptions: WEEKDAY_OPTIONS,
    chosenWeekdays: form.values.daysOfWeek.split(',').filter(Boolean),
    setWeekdays: (days: string[]) => form.setValue('daysOfWeek', days.sort().join(',')),
    setRepeat(value: string) {
      form.setValue('repeat', value);
      // Sensible first guesses from the start date, which the person can change.
      const start = form.values.startsOn || todayIso();
      if (value === 'weekly' && !form.values.daysOfWeek) form.setValue('daysOfWeek', String(isoWeekday(start)));
      if (value === 'monthly' && !form.values.dayOfMonth) form.setValue('dayOfMonth', String(Number(start.slice(8, 10))));
    },
    repeatSummary:
      repeating && form.values.repeat !== 'none'
        ? describeRule({
            frequency: form.values.repeat as 'daily' | 'weekly' | 'monthly',
            intervalCount: Number(form.values.intervalCount) || 1,
            daysOfWeek: form.values.daysOfWeek.split(',').filter(Boolean).map(Number),
            dayOfMonth: Number(form.values.dayOfMonth) || 1,
          })
        : null,
    // Section 4.4: editing one occurrence of a series asks which ones the change is for.
    isOccurrence: Boolean(ruleId),
    seriesSummary: rule.data ? describeRule(rule.data) : null,
    seriesActive: rule.data?.status === 'active',
    editScope,
    setEditScope: (value: string) => setEditScope(value as EditScope),
    scopeOptions: [
      { value: 'one', label: 'Only this task' },
      { value: 'series', label: 'This and later tasks in the series' },
    ],
    submit() {
      const value = form.validate();
      if (value) save.mutate(value);
    },
  };
}

const REMINDER_PRESETS = [
  { value: 'due-0800', label: 'On the due day, 08:00' },
  { value: 'before-1800', label: 'The evening before, 18:00' },
  { value: 'tomorrow-0800', label: 'Tomorrow, 08:00' },
  { value: 'custom', label: 'Choose a day and time' },
];

const SNOOZE_CHOICES = [
  { minutes: 60, label: '1 hour' },
  { minutes: 24 * 60, label: '1 day' },
];

export function useTaskDetailViewModel(taskId: string) {
  const { plan, business, userId, can, scope, goals } = usePlanQueries();
  const members = useMemberOptions();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const task = useQuery({ queryKey: [...scope, 'tasks', taskId], queryFn: () => plan.getTask(taskId) });
  const comments = useQuery({ queryKey: [...scope, 'tasks', taskId, 'comments'], queryFn: () => plan.listComments(taskId) });
  const reminders = useQuery({ queryKey: [...scope, 'tasks', taskId, 'reminders'], queryFn: () => plan.listReminders(taskId) });
  const [showHistory, setShowHistory] = useState(false);
  const history = useQuery({ queryKey: [...scope, 'tasks', taskId, 'history'], queryFn: () => plan.taskHistory(taskId), enabled: showHistory });
  const ruleId = task.data?.ruleId ?? null;
  const rule = useQuery({ queryKey: [...scope, 'series', ruleId], queryFn: () => plan.getRule(ruleId ?? ''), enabled: Boolean(ruleId) });
  const [blockReason, setBlockReason] = useState('');
  const [askingReason, setAskingReason] = useState(false);
  const commentForm = useForm(commentFormSchema, { body: '' });
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [reminderPreset, setReminderPreset] = useState('due-0800');
  const reminderForm = useForm(reminderFormSchema, { on: daysFrom(todayIso(), 1), at: '08:00' });

  const refresh = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const change = useMutation({
    mutationFn: ({ status, reason }: { status: TaskStatus; reason?: string }) => {
      const current = task.data;
      if (!current) throw new Error('Task not loaded.');
      return plan.updateTask(
        business.id,
        taskId,
        {
          title: current.title,
          description: current.description,
          priority: current.priority,
          status,
          dueOn: current.dueOn,
          completionNote: current.completionNote,
          blockerReason: reason ?? current.blockerReason,
          assignedTo: current.assignedTo,
          goalIds: current.goalIds,
        },
        current.version,
      );
    },
    onSuccess: async (_result, { status }) => {
      setAskingReason(false);
      setBlockReason('');
      await refresh();
      feedback.success(`Marked as ${TASK_STATUS_LABELS[status].toLowerCase()}.`);
    },
    onError: async (error) => {
      feedback.error(errorMessage(error));
      // A conflict means the screen is out of date, so show the latest.
      await refresh();
    },
  });

  const addComment = useMutation({
    mutationFn: (body: string) => plan.addComment(business.id, taskId, body),
    onSuccess: async () => {
      commentForm.reset({ body: '' });
      await refresh();
    },
    ...report,
  });
  const editComment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => plan.editComment(id, body),
    onSuccess: async () => {
      setEditingComment(null);
      await refresh();
    },
    ...report,
  });
  const removeComment = useMutation({ mutationFn: (id: string) => plan.removeComment(id), onSuccess: refresh, ...report });

  const setReminder = useMutation({
    mutationFn: ({ on, at }: { on: string; at: string }) => plan.setReminder(taskId, on, at),
    onSuccess: async (_result, { on, at }) => {
      await refresh();
      feedback.success(`We will remind you on ${on} at ${at}.`);
    },
    ...report,
  });
  const snooze = useMutation({ mutationFn: ({ id, minutes }: { id: string; minutes: number }) => plan.snoozeReminder(id, minutes), onSuccess: refresh, ...report });
  const dismiss = useMutation({ mutationFn: (id: string) => plan.dismissReminder(id), onSuccess: refresh, ...report });

  const current = task.data;
  const canEdit = can('plan.tasks');
  const status = current?.status;
  const today = todayIso();
  const now = new Date();
  const open = current !== undefined && isOpen(current);
  // Presets that need a due date are offered only when the task has one.
  const reminderPresets = REMINDER_PRESETS.filter((preset) => Boolean(current?.dueOn) || (preset.value !== 'due-0800' && preset.value !== 'before-1800'));
  const chosenPreset = reminderPresets.some((preset) => preset.value === reminderPreset) ? reminderPreset : (reminderPresets[0]?.value ?? 'custom');

  return {
    loading: task.isPending,
    error: task.error ? errorMessage(task.error) : null,
    task: current ?? null,
    statusLabel: status ? TASK_STATUS_LABELS[status] : '',
    priorityLabel: current ? PRIORITY_LABELS[current.priority] : '',
    overdue: current ? isOverdue(current, today) : false,
    assignee: members.nameOf(current?.assignedTo ?? null),
    linkedGoals: (goals.data ?? []).filter((goal) => current?.goalIds.includes(goal.id)).map((goal) => ({ id: goal.id, title: goal.title })),
    series: rule.data ? { id: rule.data.id, summary: describeRule(rule.data), active: rule.data.status === 'active' } : null,
    canEdit,
    busy: change.isPending,
    canStart: canEdit && (status === 'not_started' || status === 'blocked'),
    canComplete: canEdit && open,
    canBlock: canEdit && (status === 'not_started' || status === 'in_progress'),
    canCancel: canEdit && open,
    canReopen: canEdit && (status === 'completed' || status === 'cancelled'),
    start: () => change.mutate({ status: 'in_progress' }),
    complete: () => change.mutate({ status: 'completed' }),
    cancel: () => change.mutate({ status: 'cancelled' }),
    reopen: () => change.mutate({ status: 'not_started' }),
    askingReason,
    askToBlock: () => setAskingReason(true),
    cancelBlock: () => setAskingReason(false),
    blockReason,
    setBlockReason,
    confirmBlock() {
      if (!blockReason.trim()) {
        feedback.error('Say what is blocking the task.');
        return;
      }
      change.mutate({ status: 'blocked', reason: blockReason.trim() });
    },

    // Comments (entity TASK_COMMENT).
    comments: (comments.data ?? []).map((comment) => ({
      ...comment,
      author: members.nameOf(comment.authorId) ?? (comment.authorId === userId ? 'You' : 'A team member'),
      mine: comment.authorId === userId,
    })),
    canComment: canEdit,
    commentForm,
    addingComment: addComment.isPending,
    addComment() {
      const value = commentForm.validate();
      if (value) addComment.mutate(value.body);
    },
    editingComment,
    editText,
    setEditText,
    startEditComment(id: string, body: string) {
      setEditingComment(id);
      setEditText(body);
    },
    cancelEditComment: () => setEditingComment(null),
    saveComment() {
      if (!editingComment || !editText.trim()) return;
      editComment.mutate({ id: editingComment, body: editText.trim() });
    },
    removeComment: (id: string) => removeComment.mutate(id),

    // Reminders (section 9): each person's own.
    reminders: (reminders.data ?? [])
      .filter((reminder) => reminder.status !== 'dismissed')
      .map((reminder) => ({ ...reminder, state: reminderState(reminder, now), canSnooze: open && (reminder.status === 'sent' || reminder.status === 'pending') })),
    canRemind: open,
    reminderPresets,
    reminderPreset: chosenPreset,
    setReminderPreset,
    reminderForm,
    settingReminder: setReminder.isPending,
    addReminder() {
      const due = current?.dueOn;
      if (chosenPreset === 'custom') {
        const value = reminderForm.validate();
        if (value) setReminder.mutate(value);
        return;
      }
      if (chosenPreset === 'due-0800' && due) setReminder.mutate({ on: due, at: '08:00' });
      else if (chosenPreset === 'before-1800' && due) setReminder.mutate({ on: daysFrom(due, -1), at: '18:00' });
      else setReminder.mutate({ on: daysFrom(today, 1), at: '08:00' });
    },
    snoozeChoices: SNOOZE_CHOICES,
    snooze: (id: string, minutes: number) => snooze.mutate({ id, minutes }),
    dismissReminder: (id: string) => dismiss.mutate(id),

    // History (section 4.3), loaded only when asked for.
    showHistory,
    toggleHistory: () => setShowHistory((value) => !value),
    historyLoading: showHistory && history.isPending,
    history: (history.data ?? []).map((entry) => ({
      key: `${entry.occurredAt}-${entry.action}`,
      when: entry.occurredAt,
      who: entry.actorName ?? 'Verida',
      lines: describeChanges(entry, members.nameOf, formatDay),
    })),
  };
}

const NEW_GOAL = {
  title: '',
  description: '',
  goalType: 'measurable',
  direction: 'increase',
  unit: '',
  baselineValue: '',
  targetValue: '',
  tolerance: '',
  kpiCode: '',
  startOn: todayIso(),
  targetOn: '',
  status: 'active',
  statusReason: '',
};

const numberText = (value: number | null) => (value === null ? '' : String(value));

export function useGoalFormViewModel({ goalId, onDone }: { goalId?: string; onDone: (id: string) => void }) {
  const { plan, business, can, scope } = usePlanQueries();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(goalFormSchema, { ...NEW_GOAL, startOn: todayIso() });
  const { reset } = form;
  const existing = useQuery({ queryKey: [...scope, 'goals', goalId], queryFn: () => plan.getGoal(goalId ?? ''), enabled: Boolean(goalId) });
  const kpis = useQuery({ queryKey: [...scope, 'kpi-options'], queryFn: () => plan.kpiOptions(business.id), staleTime: Infinity });

  useEffect(() => {
    const goal = existing.data;
    if (!goal) return;
    reset({
      title: goal.title,
      description: goal.description ?? '',
      goalType: goal.goalType,
      direction: goal.direction ?? 'increase',
      unit: goal.unit ?? '',
      baselineValue: numberText(goal.baselineValue),
      targetValue: numberText(goal.targetValue),
      tolerance: numberText(goal.tolerance),
      kpiCode: goal.kpiCode ?? '',
      startOn: goal.startOn,
      targetOn: goal.targetOn ?? '',
      status: goal.status,
      statusReason: goal.statusReason ?? '',
    });
  }, [existing.data, reset]);

  const save = useMutation({
    mutationFn: (input: GoalInput) => (goalId ? plan.updateGoal(goalId, input).then(() => goalId) : plan.createGoal(business.id, input)),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success(goalId ? 'Goal updated.' : 'Goal created.');
      onDone(id);
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    isEditing: Boolean(goalId),
    loading: Boolean(goalId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    form,
    canSave: can('plan.goals'),
    saving: save.isPending,
    // A goal's kind is fixed once created, since its progress means something different.
    canChangeType: !goalId,
    typeOptions: [
      { value: 'measurable', label: 'A number to reach' },
      { value: 'milestone', label: 'Steps to complete' },
    ],
    directionOptions: DIRECTION_OPTIONS,
    statusOptions: GOAL_STATUS_OPTIONS,
    kpiOptions: [{ value: '', label: 'I will record progress myself' }, ...(kpis.data ?? []).map((kpi) => ({ value: kpi.code, label: kpi.name }))],
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}

export function useGoalDetailViewModel(goalId: string) {
  const { plan, business, can, scope, tasks } = usePlanQueries();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const goal = useQuery({ queryKey: [...scope, 'goals', goalId], queryFn: () => plan.getGoal(goalId) });
  const progress = useQuery({ queryKey: [...scope, 'goals', goalId, 'progress'], queryFn: () => plan.goalProgress(goalId) });
  const milestones = useQuery({ queryKey: [...scope, 'goals', goalId, 'milestones'], queryFn: () => plan.listMilestones(goalId) });
  const observations = useQuery({ queryKey: [...scope, 'goals', goalId, 'observations'], queryFn: () => plan.listProgress(goalId) });
  const members = useMemberOptions();
  const kpis = useQuery({ queryKey: [...scope, 'kpi-options'], queryFn: () => plan.kpiOptions(business.id), staleTime: Infinity });
  const progressForm = useForm(progressFormSchema, { recordedOn: todayIso(), actualValue: '', note: '' });
  const milestoneForm = useForm(milestoneFormSchema, { title: '', dueOn: '' });
  const [statusReason, setStatusReason] = useState('');
  const [pendingStatus, setPendingStatus] = useState<GoalStatus | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const addProgress = useMutation({
    mutationFn: (entry: { recordedOn: string; actualValue: number; note: string | null }) => plan.addProgress(business.id, goalId, entry),
    onSuccess: async () => {
      progressForm.reset({ recordedOn: todayIso(), actualValue: '', note: '' });
      await refresh();
      feedback.success('Progress recorded.');
    },
    ...report,
  });
  const addMilestone = useMutation({
    mutationFn: (input: { title: string; dueOn: string | null }) => plan.addMilestone(business.id, goalId, { ...input, sortOrder: (milestones.data ?? []).length + 1 }),
    onSuccess: async () => {
      milestoneForm.reset({ title: '', dueOn: '' });
      await refresh();
    },
    ...report,
  });
  const toggleMilestone = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => plan.setMilestoneStatus(id, done ? 'completed' : 'pending'),
    onSuccess: refresh,
    ...report,
  });
  const removeMilestone = useMutation({ mutationFn: (id: string) => plan.removeMilestone(id), onSuccess: refresh, ...report });
  const changeStatus = useMutation({
    mutationFn: ({ status, reason }: { status: GoalStatus; reason: string | null }) => {
      const current = goal.data;
      if (!current) throw new Error('Goal not loaded.');
      const { id: _id, ...rest } = current;
      return plan.updateGoal(goalId, { ...rest, status, statusReason: reason });
    },
    onSuccess: async (_result, { status }) => {
      setPendingStatus(null);
      setStatusReason('');
      await refresh();
      feedback.success(`Goal marked as ${GOAL_STATUS_LABELS[status].toLowerCase()}.`);
    },
    ...report,
  });

  const current = goal.data;
  const canManage = can('plan.goals');
  const linkedTasks = useMemo(() => (tasks.data ?? []).filter((task) => task.goalIds.includes(goalId)), [tasks.data, goalId]);
  const measurable = current?.goalType === 'measurable';
  const kpiName = kpis.data?.find((kpi) => kpi.code === current?.kpiCode)?.name ?? null;

  return {
    loading: goal.isPending || progress.isPending,
    error: goal.error ? errorMessage(goal.error) : progress.error ? errorMessage(progress.error) : null,
    goal: current ?? null,
    statusLabel: current ? GOAL_STATUS_LABELS[current.status] : '',
    directionLabel: current?.direction ? DIRECTION_LABELS[current.direction] : null,
    progress: progress.data ?? null,
    summary: current && progress.data ? describeProgress(current, progress.data) : '',
    ratio: progress.data?.percent == null ? null : Math.max(0, Math.min(1, progress.data.percent / 100)),
    source:
      progress.data?.source === 'kpi'
        ? `From ${kpiName ?? 'a Verida measure'}`
        : progress.data?.source === 'kpi_estimated'
          ? `From ${kpiName ?? 'a Verida measure'}, estimated`
          : progress.data?.source === 'manual'
            ? 'Recorded by your team'
            : null,
    measurable,
    followsKpi: Boolean(current?.kpiCode),
    canManage,
    canAddTask: can('plan.tasks'),
    milestones: (milestones.data ?? []).map((m) => ({ ...m, done: m.status === 'completed' })),
    // Section 4.2 and 4.5: every recorded observation, newest first, with who recorded it.
    observations: (observations.data ?? []).map((entry) => ({ ...entry, recordedBy: members.nameOf(entry.createdBy) })),
    linkedTasks: linkedTasks.map((task) => ({ id: task.id, title: task.title, statusLabel: TASK_STATUS_LABELS[task.status], open: isOpen(task) })),
    // Section 4.5: task completion is shown beside the goal, never as proof that it moved.
    taskSummary: linkedTasks.length === 0 ? null : `${linkedTasks.filter((task) => task.status === 'completed').length} of ${linkedTasks.filter((task) => task.status !== 'cancelled').length} linked tasks completed`,
    progressForm,
    recordingProgress: addProgress.isPending,
    recordProgress() {
      const entry = progressForm.validate();
      if (entry) addProgress.mutate(entry);
    },
    milestoneForm,
    addingMilestone: addMilestone.isPending,
    addMilestone() {
      const input = milestoneForm.validate();
      if (input) addMilestone.mutate(input);
    },
    toggleMilestone: (id: string, done: boolean) => toggleMilestone.mutate({ id, done }),
    removeMilestone: (id: string) => removeMilestone.mutate(id),
    statusChoices: (['active', 'on_hold', 'at_risk', 'completed', 'cancelled'] as const).filter((status) => status !== current?.status),
    statusName: (status: GoalStatus) => GOAL_STATUS_LABELS[status],
    pendingStatus,
    chooseStatus(status: GoalStatus) {
      if (status === 'cancelled' || status === 'at_risk' || status === 'on_hold') setPendingStatus(status);
      else changeStatus.mutate({ status, reason: null });
    },
    cancelStatus: () => setPendingStatus(null),
    statusReason,
    setStatusReason,
    changingStatus: changeStatus.isPending,
    confirmStatus() {
      if (!pendingStatus) return;
      if (pendingStatus === 'cancelled' && !statusReason.trim()) {
        feedback.error('Say why the goal is cancelled.');
        return;
      }
      changeStatus.mutate({ status: pendingStatus, reason: statusReason.trim() || null });
    },
  };
}
