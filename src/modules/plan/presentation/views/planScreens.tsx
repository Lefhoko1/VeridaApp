import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Checkbox, Divider, IconButton, List, Searchbar, SegmentedButtons, Text } from 'react-native-paper';

import { formatDate, formatQuantity } from '@/core/format/format';
import {
  BarRow,
  Button,
  ConfirmDialog,
  DateField,
  DetailPanel,
  EmptyState,
  ErrorView,
  FieldGrid,
  FormField,
  LoadingView,
  MetricCard,
  MetricGrid,
  MultiSelectField,
  Notice,
  Panel,
  ProfileHeader,
  Row,
  Screen,
  SectionHeader,
  SelectField,
  StatusPill,
  spacing,
  supporting,
  type StatusTone,
} from '@/design-system';

import type { GoalStatus, TaskPriority, TaskStatus } from '../../domain/models';
import {
  useGoalDetailViewModel,
  useGoalFormViewModel,
  useGoalListViewModel,
  usePlanOverviewViewModel,
  useTaskDetailViewModel,
  useTaskFormViewModel,
  useTaskListViewModel,
} from '../viewmodels/usePlanViewModels';

const PRIORITY_TONES: Record<TaskPriority, StatusTone> = { urgent: 'danger', high: 'warn', normal: 'neutral', low: 'neutral' };
const TASK_TONES: Record<TaskStatus, StatusTone> = { not_started: 'neutral', in_progress: 'warn', blocked: 'danger', completed: 'ok', cancelled: 'neutral' };
const GOAL_TONES: Record<GoalStatus, StatusTone> = { active: 'ok', on_hold: 'neutral', at_risk: 'warn', completed: 'ok', cancelled: 'neutral', expired: 'neutral' };

type TaskRowData = {
  id: string;
  title: string;
  priority: TaskPriority;
  priorityLabel: string;
  status: TaskStatus;
  statusLabel: string;
  dueOn: string | null;
  overdue: boolean;
  dueToday: boolean;
  assignee: string | null;
};

function TaskRows({ items, onOpen, empty }: { items: TaskRowData[]; onOpen: (id: string) => void; empty: string }) {
  if (items.length === 0) return <Text style={styles.muted}>{empty}</Text>;
  return (
    <>
      {items.map((task, index) => (
        <View key={task.id}>
          {index > 0 ? <Divider /> : null}
          <List.Item
            title={task.title}
            titleStyle={task.status === 'cancelled' ? styles.struck : undefined}
            description={[task.overdue ? `Overdue, due ${formatDate(task.dueOn ?? '')}` : task.dueToday ? 'Due today' : task.dueOn ? `Due ${formatDate(task.dueOn)}` : null, task.assignee]
              .filter(Boolean)
              .join(' · ')}
            descriptionStyle={task.overdue ? styles.overdue : undefined}
            onPress={() => onOpen(task.id)}
            right={() => (
              <View style={styles.rowEnd}>
                {task.priority === 'urgent' || task.priority === 'high' ? <StatusPill label={task.priorityLabel} tone={PRIORITY_TONES[task.priority]} /> : null}
                {task.status !== 'not_started' ? <StatusPill label={task.statusLabel} tone={TASK_TONES[task.status]} /> : null}
              </View>
            )}
          />
        </View>
      ))}
    </>
  );
}

type GoalCardData = { id: string; title: string; status: GoalStatus; statusLabel: string; summary: string; ratio: number | null; targetOn: string | null };

function GoalCards({ items, onOpen }: { items: GoalCardData[]; onOpen: (id: string) => void }) {
  return (
    <>
      {items.map((goal, index) => (
        <View key={goal.id}>
          {index > 0 ? <Divider /> : null}
          <List.Item
            title={goal.title}
            description={[goal.summary, goal.targetOn ? `by ${formatDate(goal.targetOn)}` : null].filter(Boolean).join(' · ')}
            descriptionNumberOfLines={2}
            onPress={() => onOpen(goal.id)}
            right={() => (goal.status !== 'active' ? <StatusPill label={goal.statusLabel} tone={GOAL_TONES[goal.status]} /> : null)}
          />
          {goal.ratio !== null ? <BarRow label="" ratio={goal.ratio} value="" /> : null}
        </View>
      ))}
    </>
  );
}

const SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'goals', label: 'Goals' },
  { value: 'tasks', label: 'Tasks' },
];

type PlanScreenProps = {
  onNewTask: () => void;
  onNewGoal: () => void;
  onOpenTask: (id: string) => void;
  onOpenGoal: (id: string) => void;
};

// Section 1: the Business Planning & Action Centre.
export function PlanScreen(props: PlanScreenProps) {
  const [section, setSection] = useState('overview');
  const header = <SegmentedButtons value={section} onValueChange={setSection} buttons={SECTIONS} />;
  if (section === 'goals') return <GoalList header={header} {...props} />;
  if (section === 'tasks') return <TaskList header={header} {...props} />;
  return <PlanOverview header={header} {...props} />;
}

const PERIODS = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
];

function PlanOverview({ header, onNewTask, onNewGoal, onOpenTask, onOpenGoal }: PlanScreenProps & { header: React.ReactNode }) {
  const vm = usePlanOverviewViewModel();
  if (!vm.canView) return <Screen>{header}<Notice tone="info">You do not have access to this business&apos;s plan.</Notice></Screen>;
  if (vm.loading) return <Screen>{header}<LoadingView /></Screen>;
  if (vm.error) return <Screen>{header}<ErrorView message={vm.error} onRetry={vm.retry} /></Screen>;
  const n = vm.numbers;
  const rate = (value: number | null | undefined) => (value === null || value === undefined ? 'No data' : `${value}%`);

  return (
    <Screen>
      {header}
      <Row wrap>
        {vm.canCreateTask ? (
          <Button mode="contained" icon="plus" onPress={onNewTask}>
            New task
          </Button>
        ) : null}
        {vm.canCreateGoal ? (
          <Button mode="outlined" icon="flag-outline" onPress={onNewGoal}>
            New goal
          </Button>
        ) : null}
      </Row>
      <MetricGrid>
        <MetricCard index={0} label="Open tasks" value={formatQuantity(n?.openTasks ?? 0)} />
        <MetricCard index={1} label="Active goals" value={formatQuantity(n?.activeGoals ?? 0)} />
        <MetricCard index={2} label="Completed" value={formatQuantity(n?.completedInPeriod ?? 0)} caption={vm.period === 'week' ? 'Last 7 days' : 'Last 30 days'} />
        <MetricCard
          index={3}
          label="Overdue or blocked"
          value={formatQuantity((n?.overdueTasks ?? 0) + (n?.blockedTasks ?? 0))}
          status={(n?.overdueTasks ?? 0) + (n?.blockedTasks ?? 0) > 0 ? { label: 'Needs attention', tone: 'warn' } : undefined}
        />
      </MetricGrid>

      <Panel style={styles.list}>
        <SectionHeader title="Today's focus" description="Overdue and due today first, then by priority." />
        <TaskRows items={vm.focus} onOpen={onOpenTask} empty="Nothing due. Add a task, or look at what is coming up." />
      </Panel>

      <Panel style={styles.list}>
        <SectionHeader title="Active goals" />
        {vm.goals.length === 0 ? <Text style={styles.muted}>No active goals yet.</Text> : <GoalCards items={vm.goals} onOpen={onOpenGoal} />}
      </Panel>

      <Panel style={styles.list}>
        <SectionHeader title="Coming up" description="Due in the next 7 days." />
        <TaskRows items={vm.upcoming} onOpen={onOpenTask} empty="Nothing due this week." />
      </Panel>

      <Panel>
        <SectionHeader title="Progress" description="How the team kept its commitments. This does not show whether business figures improved." />
        <SelectField label="Period" value={vm.period} options={PERIODS} onChange={vm.setPeriod} />
        <DetailPanel
          rows={[
            { label: 'Tasks due in the period', value: formatQuantity(n?.eligibleDue ?? 0), half: true },
            { label: 'Completion rate', value: rate(n?.completionRate), half: true },
            { label: 'Completed on time', value: rate(n?.onTimeRate), half: true },
            { label: 'Blocked now', value: formatQuantity(n?.blockedTasks ?? 0), half: true },
          ]}
        />
        <Text style={styles.muted}>Cancelled tasks are left out. A rescheduled task counts on its current due date.</Text>
      </Panel>
    </Screen>
  );
}

const TASK_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

function TaskList({ header, onNewTask, onOpenTask }: PlanScreenProps & { header: React.ReactNode }) {
  const vm = useTaskListViewModel();
  return (
    <Screen>
      {header}
      {vm.canCreate ? (
        <Button mode="contained" icon="plus" onPress={onNewTask}>
          New task
        </Button>
      ) : null}
      <FieldGrid>
        <SelectField label="Show" value={vm.filter} options={TASK_FILTERS} onChange={vm.setFilter} />
        <SelectField label="Priority" value={vm.priority} options={vm.priorityOptions} onChange={vm.setPriority} />
        <SelectField label="Assigned to" value={vm.assignee} options={vm.assigneeOptions} onChange={vm.setAssignee} />
      </FieldGrid>
      <Searchbar placeholder="Search tasks" value={vm.search} onChangeText={vm.setSearch} style={styles.search} />
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="done" title="No tasks here." description="A task needs only a title. Add the rest when you know it." />
      ) : (
        <Panel style={styles.list}>
          <TaskRows items={vm.items} onOpen={onOpenTask} empty="" />
        </Panel>
      )}
    </Screen>
  );
}

function GoalList({ header, onNewGoal, onOpenGoal }: PlanScreenProps & { header: React.ReactNode }) {
  const vm = useGoalListViewModel();
  return (
    <Screen>
      {header}
      <Row wrap>
        {vm.canCreate ? (
          <Button mode="contained" icon="flag-outline" onPress={onNewGoal}>
            New goal
          </Button>
        ) : null}
        <Button mode="outlined" onPress={vm.toggleClosed}>
          {vm.showClosed ? 'Hide finished goals' : 'Show finished goals'}
        </Button>
      </Row>
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="growth" title="No goals yet." description="A goal can be a number to reach, such as 450 trays a month, or steps to complete." />
      ) : (
        <Panel style={styles.list}>
          <GoalCards items={vm.items} onOpen={onOpenGoal} />
        </Panel>
      )}
    </Screen>
  );
}

export function TaskFormScreen({ taskId, goalId, onDone }: { taskId?: string; goalId?: string; onDone: (id: string) => void }) {
  const vm = useTaskFormViewModel({ taskId, goalId, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen variant="form">
      <Panel>
        <FormField label="What needs doing?" value={values.title} onChangeText={(v) => setValue('title', v)} error={errors.title} />
        <FieldGrid>
          <DateField label="Due date (optional)" value={values.dueOn} onChangeText={(v) => setValue('dueOn', v)} error={errors.dueOn} />
          <SelectField label="Priority" value={values.priority} options={vm.priorityOptions} onChange={(v) => setValue('priority', v as TaskPriority)} />
          <SelectField label="Assigned to" value={values.assignedTo} options={vm.assigneeOptions} onChange={(v) => setValue('assignedTo', v)} />
          {vm.isEditing ? <SelectField label="Status" value={values.status} options={vm.statusOptions} onChange={(v) => setValue('status', v as TaskStatus)} /> : null}
        </FieldGrid>
        {values.status === 'blocked' ? <FormField label="What is blocking it?" value={values.blockerReason} onChangeText={(v) => setValue('blockerReason', v)} error={errors.blockerReason} /> : null}
        {values.status === 'completed' ? <FormField label="Completion note (optional)" value={values.completionNote} onChangeText={(v) => setValue('completionNote', v)} error={errors.completionNote} /> : null}
        <MultiSelectField
          label="Goals it supports (optional)"
          values={vm.chosenGoals}
          options={vm.goalOptions}
          onChange={vm.setGoals}
          allowOther={false}
          allLabel=""
          emptyText="No goal"
        />
        <FormField label="Details (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} multiline />
      </Panel>
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          {vm.isEditing ? 'Save changes' : 'Add task'}
        </Button>
      ) : null}
    </Screen>
  );
}

export function TaskProfileScreen({ taskId, onEdit, onOpenGoal }: { taskId: string; onEdit: () => void; onOpenGoal: (id: string) => void }) {
  const vm = useTaskDetailViewModel(taskId);
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.task) return <ErrorView message={vm.error ?? 'This task could not be found.'} />;
  const { task } = vm;

  return (
    <Screen>
      <ProfileHeader
        icon="checkbox-marked-circle-outline"
        tone="neutral"
        title={task.title}
        subtitle={task.dueOn ? `Due ${formatDate(task.dueOn)}` : 'No due date'}
        struckThrough={task.status === 'cancelled'}
        status={{ label: vm.statusLabel, tone: TASK_TONES[task.status] }}
      />
      {vm.overdue ? <Notice title="Overdue">{`This was due on ${formatDate(task.dueOn ?? '')}.`}</Notice> : null}
      {task.status === 'blocked' && task.blockerReason ? <Notice title="Blocked">{task.blockerReason}</Notice> : null}
      <DetailPanel
        rows={[
          { label: 'Priority', value: vm.priorityLabel, half: true },
          { label: 'Assigned to', value: vm.assignee ?? 'Nobody yet', half: true },
          { label: 'Completed', value: task.completedAt ? formatDate(task.completedAt.slice(0, 10)) : null, half: true },
          { label: 'Completion note', value: task.completionNote },
          { label: 'Details', value: task.description },
        ]}
      />
      {vm.linkedGoals.length > 0 ? (
        <Panel style={styles.list}>
          <SectionHeader title="Supports these goals" />
          {vm.linkedGoals.map((goal) => (
            <List.Item key={goal.id} title={goal.title} left={(p) => <List.Icon {...p} icon="flag-outline" />} onPress={() => onOpenGoal(goal.id)} />
          ))}
        </Panel>
      ) : null}
      <Row wrap>
        {vm.canComplete ? (
          <Button mode="contained" icon="check" onPress={vm.complete} disabled={vm.busy}>
            Mark as completed
          </Button>
        ) : null}
        {vm.canStart ? (
          <Button mode="outlined" onPress={vm.start} disabled={vm.busy}>
            Start
          </Button>
        ) : null}
        {vm.canBlock ? (
          <Button mode="outlined" onPress={vm.askToBlock} disabled={vm.busy}>
            Report a blocker
          </Button>
        ) : null}
        {vm.canReopen ? (
          <Button mode="outlined" onPress={vm.reopen} disabled={vm.busy}>
            Reopen
          </Button>
        ) : null}
      </Row>
      {vm.canEdit ? (
        <Button icon="pencil-outline" onPress={onEdit}>
          Edit task
        </Button>
      ) : null}
      {vm.canCancel ? (
        <Button onPress={vm.cancel} disabled={vm.busy} textColor={supporting.error}>
          Cancel this task
        </Button>
      ) : null}
      <ConfirmDialog
        visible={vm.askingReason}
        title="What is blocking this task?"
        message="The team sees the reason on the task until it moves on."
        confirmLabel="Mark as blocked"
        busy={vm.busy}
        onDismiss={vm.cancelBlock}
        onConfirm={vm.confirmBlock}
        reason={{ label: 'Blocker', value: vm.blockReason, onChange: vm.setBlockReason }}
      />
    </Screen>
  );
}

export function GoalFormScreen({ goalId, onDone }: { goalId?: string; onDone: (id: string) => void }) {
  const vm = useGoalFormViewModel({ goalId, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;
  const measurable = values.goalType === 'measurable';

  return (
    <Screen variant="form">
      <Panel>
        <FormField label="Goal" value={values.title} onChangeText={(v) => setValue('title', v)} error={errors.title} hint="For example: Increase monthly egg sales." />
        {vm.canChangeType ? <SelectField label="How will you know it is done?" value={values.goalType} options={vm.typeOptions} onChange={(v) => setValue('goalType', v)} /> : null}
        {measurable ? (
          <>
            <SelectField label="What should happen?" value={values.direction} options={vm.directionOptions} onChange={(v) => setValue('direction', v)} error={errors.direction} />
            <FieldGrid>
              {values.direction === 'increase' || values.direction === 'decrease' ? (
                <FormField label="Starting value (optional)" value={values.baselineValue} onChangeText={(v) => setValue('baselineValue', v)} error={errors.baselineValue} keyboardType="numbers-and-punctuation" hint="Needed for a percentage." />
              ) : null}
              <FormField label="Target" value={values.targetValue} onChangeText={(v) => setValue('targetValue', v)} error={errors.targetValue} keyboardType="numbers-and-punctuation" />
              {values.direction === 'maintain' ? (
                <FormField label="Allowed difference (optional)" value={values.tolerance} onChangeText={(v) => setValue('tolerance', v)} error={errors.tolerance} keyboardType="numbers-and-punctuation" />
              ) : null}
              <FormField label="Unit (optional)" value={values.unit} onChangeText={(v) => setValue('unit', v)} error={errors.unit} hint="Such as trays or BWP." />
            </FieldGrid>
            <SelectField label="Where progress comes from" value={values.kpiCode} options={vm.kpiOptions} onChange={(v) => setValue('kpiCode', v)} hint="A Verida measure updates itself from your records." />
          </>
        ) : (
          <Notice tone="info">You will add the steps as milestones after saving. Progress shows how many are done.</Notice>
        )}
        <FieldGrid>
          <DateField label="Start" value={values.startOn} onChangeText={(v) => setValue('startOn', v)} error={errors.startOn} />
          <DateField label="Target date (optional)" value={values.targetOn} onChangeText={(v) => setValue('targetOn', v)} error={errors.targetOn} />
          {vm.isEditing ? <SelectField label="Status" value={values.status} options={vm.statusOptions} onChange={(v) => setValue('status', v)} /> : null}
        </FieldGrid>
        {values.status !== 'active' ? <FormField label="Reason" value={values.statusReason} onChangeText={(v) => setValue('statusReason', v)} error={errors.statusReason} /> : null}
        <FormField label="Details (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} multiline />
      </Panel>
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          {vm.isEditing ? 'Save changes' : 'Create goal'}
        </Button>
      ) : null}
    </Screen>
  );
}

type GoalProfileProps = { goalId: string; onEdit: () => void; onOpenTask: (id: string) => void; onAddTask: () => void };

export function GoalProfileScreen({ goalId, onEdit, onOpenTask, onAddTask }: GoalProfileProps) {
  const vm = useGoalDetailViewModel(goalId);
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.goal) return <ErrorView message={vm.error ?? 'This goal could not be found.'} />;
  const { goal } = vm;
  const progressValues = vm.progressForm.values;
  const milestoneValues = vm.milestoneForm.values;

  return (
    <Screen>
      <ProfileHeader icon="flag-outline" tone="neutral" title={goal.title} subtitle={goal.targetOn ? `By ${formatDate(goal.targetOn)}` : undefined} status={{ label: vm.statusLabel, tone: GOAL_TONES[goal.status] }} />
      {goal.statusReason ? <Notice title={vm.statusLabel}>{goal.statusReason}</Notice> : null}

      <Panel>
        <SectionHeader title="Progress" />
        <Text variant="titleMedium">{vm.summary}</Text>
        {vm.ratio !== null ? <BarRow label="" ratio={vm.ratio} value="" /> : null}
        {vm.source ? <Text style={styles.muted}>{`${vm.source}${vm.progress?.actualOn ? `, as of ${formatDate(vm.progress.actualOn)}` : ''}.`}</Text> : null}
        <DetailPanel
          rows={[
            { label: 'Aim', value: vm.directionLabel, half: true },
            { label: 'Target', value: goal.targetValue === null ? null : `${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ''}`, half: true },
            { label: 'Starting value', value: goal.baselineValue === null ? null : String(goal.baselineValue), half: true },
            { label: 'Started', value: formatDate(goal.startOn), half: true },
            { label: 'Details', value: goal.description },
          ]}
        />
        {vm.taskSummary ? <Text style={styles.muted}>{`${vm.taskSummary}. Finishing tasks does not by itself show the goal moved.`}</Text> : null}
      </Panel>

      {vm.measurable && !vm.followsKpi && vm.canManage ? (
        <Panel>
          <SectionHeader title="Record progress" />
          <FieldGrid>
            <DateField label="Date" value={progressValues.recordedOn} onChangeText={(v) => vm.progressForm.setValue('recordedOn', v)} error={vm.progressForm.errors.recordedOn} />
            <FormField label={`Value${goal.unit ? ` (${goal.unit})` : ''}`} value={progressValues.actualValue} onChangeText={(v) => vm.progressForm.setValue('actualValue', v)} error={vm.progressForm.errors.actualValue} keyboardType="numbers-and-punctuation" />
          </FieldGrid>
          <FormField label="Note (optional)" value={progressValues.note} onChangeText={(v) => vm.progressForm.setValue('note', v)} error={vm.progressForm.errors.note} />
          <Button mode="outlined" onPress={vm.recordProgress} loading={vm.recordingProgress} disabled={vm.recordingProgress}>
            Record progress
          </Button>
        </Panel>
      ) : null}

      {!vm.measurable || vm.milestones.length > 0 ? (
        <Panel style={styles.list}>
          <SectionHeader title="Milestones" />
          {vm.milestones.length === 0 ? <Text style={styles.muted}>No milestones yet.</Text> : null}
          {vm.milestones.map((milestone) => (
            <Row key={milestone.id}>
              <Checkbox.Android status={milestone.done ? 'checked' : 'unchecked'} disabled={!vm.canManage} onPress={() => vm.toggleMilestone(milestone.id, !milestone.done)} />
              <View style={styles.grow}>
                <Text style={milestone.done ? styles.struck : undefined}>{milestone.title}</Text>
                {milestone.dueOn ? <Text style={styles.muted}>{`Due ${formatDate(milestone.dueOn)}`}</Text> : null}
              </View>
              {vm.canManage ? <IconButton icon="close" size={18} onPress={() => vm.removeMilestone(milestone.id)} accessibilityLabel={`Remove ${milestone.title}`} /> : null}
            </Row>
          ))}
          {vm.canManage ? (
            <View style={styles.inset}>
              <FieldGrid>
                <FormField label="New milestone" value={milestoneValues.title} onChangeText={(v) => vm.milestoneForm.setValue('title', v)} error={vm.milestoneForm.errors.title} />
                <DateField label="Due (optional)" value={milestoneValues.dueOn} onChangeText={(v) => vm.milestoneForm.setValue('dueOn', v)} error={vm.milestoneForm.errors.dueOn} />
              </FieldGrid>
              <Button mode="outlined" onPress={vm.addMilestone} disabled={vm.addingMilestone}>
                Add milestone
              </Button>
            </View>
          ) : null}
        </Panel>
      ) : null}

      <Panel style={styles.list}>
        <SectionHeader
          title="Tasks for this goal"
          action={
            vm.canAddTask ? (
              <Button compact icon="plus" onPress={onAddTask}>
                Add task
              </Button>
            ) : undefined
          }
        />
        {vm.linkedTasks.length === 0 ? <Text style={styles.muted}>No tasks linked yet.</Text> : null}
        {vm.linkedTasks.map((task) => (
          <List.Item key={task.id} title={task.title} description={task.statusLabel} titleStyle={task.open ? undefined : styles.done} onPress={() => onOpenTask(task.id)} />
        ))}
      </Panel>

      {vm.canManage ? (
        <>
          <Button icon="pencil-outline" onPress={onEdit}>
            Edit goal
          </Button>
          <Row wrap>
            {vm.statusChoices.map((status) => (
              <Button key={status} mode="outlined" compact onPress={() => vm.chooseStatus(status)} disabled={vm.changingStatus} textColor={status === 'cancelled' ? supporting.error : undefined}>
                {`Mark as ${vm.statusName(status).toLowerCase()}`}
              </Button>
            ))}
          </Row>
        </>
      ) : null}
      <ConfirmDialog
        visible={vm.pendingStatus !== null}
        title={vm.pendingStatus ? `Mark as ${vm.statusName(vm.pendingStatus).toLowerCase()}?` : ''}
        message={vm.pendingStatus === 'cancelled' ? 'The goal and its history stay, but it is no longer active.' : 'A short reason helps the team.'}
        confirmLabel="Confirm"
        destructive={vm.pendingStatus === 'cancelled'}
        busy={vm.changingStatus}
        onDismiss={vm.cancelStatus}
        onConfirm={vm.confirmStatus}
        reason={{ label: vm.pendingStatus === 'cancelled' ? 'Reason' : 'Reason (optional)', value: vm.statusReason, onChange: vm.setStatusReason }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xs, gap: 0 },
  grow: { flex: 1, minWidth: 0 },
  inset: { padding: spacing.sm, gap: spacing.sm },
  muted: { color: supporting.mutedText, fontSize: 12, padding: spacing.xs },
  overdue: { color: supporting.error },
  struck: { textDecorationLine: 'line-through', color: supporting.mutedText },
  done: { color: supporting.mutedText },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  search: { backgroundColor: 'transparent' },
});
