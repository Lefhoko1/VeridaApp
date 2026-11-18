import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { todayIso } from '@/core/format/format';
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
import { goalFormSchema, milestoneFormSchema, progressFormSchema, taskFormSchema } from '../../domain/validation';
import { usePlanDependencies } from '../di';

function daysFrom(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const options = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
export const PRIORITY_OPTIONS = options(PRIORITY_LABELS);
export const TASK_STATUS_OPTIONS = options(TASK_STATUS_LABELS);
export const GOAL_STATUS_OPTIONS = options(GOAL_STATUS_LABELS);
export const DIRECTION_OPTIONS = options(DIRECTION_LABELS);

function usePlanQueries() {
  const { plan } = usePlanDependencies();
  const { business, can } = useActiveBusiness();
  const scope = [...businessScope(business.id), 'plan'];
  const enabled = can('plan.view');
  const tasks = useQuery({ queryKey: [...scope, 'tasks'], queryFn: () => plan.listTasks(business.id), enabled });
  const goals = useQuery({ queryKey: [...scope, 'goals'], queryFn: () => plan.listGoals(business.id), enabled });
  return { plan, business, can, scope, tasks, goals, enabled };
}

// Each goal's progress comes from the backend (section 7.1). Plan never calculates it here.
function useGoalsWithProgress(goals: Goal[], scope: unknown[]) {
  const { plan } = usePlanDependencies();
  const progress = useQueries({
    queries: goals.map((goal) => ({ queryKey: [...scope, 'goals', goal.id, 'progress'], queryFn: () => plan.goalProgress(goal.id) })),
  });
  return goals.flatMap((goal, index): GoalWithProgress[] => {
    const result = progress[index]?.data;
    return result ? [{ ...goal, progress: result }] : [];
  });
}

const goalCard = (goal: GoalWithProgress) => ({
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

const taskRow = (task: Task, today: string, nameOf: (id: string | null) => string | null) => ({
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

// Section 4.1: today's focus, counts, active goals and upcoming work.
export function usePlanOverviewViewModel() {
  const { plan, business, can, scope, tasks, goals, enabled } = usePlanQueries();
  const members = useMemberOptions();
  const [period, setPeriod] = useState<PlanPeriod>('week');
  const today = todayIso();
  const from = daysFrom(today, period === 'week' ? -6 : -29);
  const overview = useQuery({
    queryKey: [...scope, 'overview', period],
    queryFn: () => plan.overview(business.id, { from, to: today }),
    enabled,
  });
  // The business's own "today", from its time zone, once the overview has loaded.
  const businessToday = overview.data?.today ?? today;
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
    period,
    setPeriod: (value: string) => setPeriod(value as PlanPeriod),
    numbers: overview.data ?? null,
    focus: focusOrder(open, businessToday)
      .filter((task) => task.dueOn === null || task.dueOn <= businessToday)
      .slice(0, 6)
      .map((task) => taskRow(task, businessToday, members.nameOf)),
    upcoming: focusOrder(open, businessToday)
      .filter((task) => task.dueOn !== null && task.dueOn > businessToday && task.dueOn <= daysFrom(businessToday, 7))
      .slice(0, 6)
      .map((task) => taskRow(task, businessToday, members.nameOf)),
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

const NEW_TASK = { title: '', description: '', priority: 'normal', status: 'not_started', dueOn: '', completionNote: '', blockerReason: '', assignedTo: '', goalIds: '' };

export function useTaskFormViewModel({ taskId, goalId, onDone }: { taskId?: string; goalId?: string; onDone: (id: string) => void }) {
  const { plan, business, can, scope, goals } = usePlanQueries();
  const members = useMemberOptions();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(taskFormSchema, { ...NEW_TASK, goalIds: goalId ?? '' });
  const { reset } = form;
  const existing = useQuery({ queryKey: [...scope, 'tasks', taskId], queryFn: () => plan.getTask(taskId ?? ''), enabled: Boolean(taskId) });

  useEffect(() => {
    const task = existing.data;
    if (!task) return;
    reset({
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

  const save = useMutation({
    mutationFn: (input: TaskInput) => (taskId ? plan.updateTask(business.id, taskId, input).then(() => taskId) : plan.createTask(business.id, input)),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success(taskId ? 'Task updated.' : 'Task added.');
      onDone(id);
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const chosenGoals = form.values.goalIds.split(',').filter(Boolean);
  const openGoals = (goals.data ?? []).filter((goal) => !['completed', 'cancelled', 'expired'].includes(goal.status) || chosenGoals.includes(goal.id));

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
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}

export function useTaskDetailViewModel(taskId: string) {
  const { plan, business, can, scope, goals } = usePlanQueries();
  const members = useMemberOptions();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const task = useQuery({ queryKey: [...scope, 'tasks', taskId], queryFn: () => plan.getTask(taskId) });
  const [blockReason, setBlockReason] = useState('');
  const [askingReason, setAskingReason] = useState(false);

  const change = useMutation({
    mutationFn: ({ status, reason }: { status: TaskStatus; reason?: string }) => {
      const current = task.data;
      if (!current) throw new Error('Task not loaded.');
      return plan.updateTask(business.id, taskId, {
        title: current.title,
        description: current.description,
        priority: current.priority,
        status,
        dueOn: current.dueOn,
        completionNote: current.completionNote,
        blockerReason: reason ?? current.blockerReason,
        assignedTo: current.assignedTo,
        goalIds: current.goalIds,
      });
    },
    onSuccess: async (_result, { status }) => {
      setAskingReason(false);
      setBlockReason('');
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success(`Marked as ${TASK_STATUS_LABELS[status].toLowerCase()}.`);
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const current = task.data;
  const canEdit = can('plan.tasks');
  const status = current?.status;
  const today = todayIso();

  return {
    loading: task.isPending,
    error: task.error ? errorMessage(task.error) : null,
    task: current ?? null,
    statusLabel: status ? TASK_STATUS_LABELS[status] : '',
    priorityLabel: current ? PRIORITY_LABELS[current.priority] : '',
    overdue: current ? isOverdue(current, today) : false,
    assignee: members.nameOf(current?.assignedTo ?? null),
    linkedGoals: (goals.data ?? []).filter((goal) => current?.goalIds.includes(goal.id)).map((goal) => ({ id: goal.id, title: goal.title })),
    canEdit,
    busy: change.isPending,
    canStart: canEdit && (status === 'not_started' || status === 'blocked'),
    canComplete: canEdit && current !== undefined && isOpen(current),
    canBlock: canEdit && (status === 'not_started' || status === 'in_progress'),
    canCancel: canEdit && current !== undefined && isOpen(current),
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
