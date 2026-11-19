import { ScrollView, StyleSheet, View } from 'react-native';
import { Checkbox, Chip, Divider, IconButton, List, Searchbar, SegmentedButtons, Text, TextInput } from 'react-native-paper';

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
} from '@/design-system';

import type { TaskPriority, TaskStatus } from '../../domain/models';
import {
  useGoalDetailViewModel,
  useGoalFormViewModel,
  useGoalListViewModel,
  usePlanOverviewViewModel,
  useTaskDetailViewModel,
  useTaskFormViewModel,
  usePlanSectionsViewModel,
  useTaskListViewModel,
  type PlanSection,
} from '../viewmodels/usePlanViewModels';
import { PendingSyncPanel, SuggestionsPanel } from './assistScreens';
import { GOAL_TONES, GoalCards, TASK_TONES, TaskRows, formatDateTime } from './planParts';
import { ProgressSection, ScheduleSection } from './scheduleScreens';

export type PlanScreenProps = {
  initialSection?: PlanSection;
  onNewTask: () => void;
  onNewGoal: () => void;
  onNewEvent: (onDate?: string) => void;
  onOpenTask: (id: string) => void;
  onOpenGoal: (id: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenSeries: (id: string) => void;
  onOpenReview: (weekStart: string) => void;
  // Section 4.6: asking Verida for suggestions, and opening one.
  onAssist: () => void;
  onOpenSuggestion: (id: string) => void;
  onOpenSettings: () => void;
};

// Section 1.2: Overview, Goals, Tasks, Schedule and Progress. Chips scroll sideways, so five
// sections fit a phone.
function SectionPicker({ value, sections, onChange }: { value: string; sections: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips} accessibilityRole="tablist">
      {sections.map((section) => (
        <Chip key={section.value} selected={value === section.value} showSelectedOverlay onPress={() => onChange(section.value)} accessibilityRole="tab" accessibilityState={{ selected: value === section.value }}>
          {section.label}
        </Chip>
      ))}
    </ScrollView>
  );
}

// Section 1: the Business Planning & Action Centre.
export function PlanScreen(props: PlanScreenProps) {
  const vm = usePlanSectionsViewModel(props.initialSection);
  const header = <SectionPicker value={vm.section} sections={vm.sections} onChange={vm.setSection} />;
  switch (vm.section) {
    case 'goals':
      return <GoalList header={header} {...props} />;
    case 'tasks':
      return <TaskList header={header} {...props} />;
    case 'schedule':
      return <ScheduleSection header={header} {...props} />;
    case 'progress':
      return <ProgressSection header={header} {...props} />;
    default:
      return <PlanOverview header={header} onShowSchedule={() => vm.setSection('schedule')} {...props} />;
  }
}

function PlanOverview({ header, onNewTask, onNewGoal, onOpenTask, onOpenGoal, onOpenEvent, onShowSchedule, onAssist, onOpenSuggestion, onOpenSettings }: PlanScreenProps & { header: React.ReactNode; onShowSchedule: () => void }) {
  const vm = usePlanOverviewViewModel();
  if (!vm.canView) return <Screen>{header}<Notice tone="info">You do not have access to this business&apos;s plan.</Notice></Screen>;
  if (vm.loading) return <Screen>{header}<LoadingView /></Screen>;
  if (vm.error) return <Screen>{header}<ErrorView message={vm.error} onRetry={vm.retry} /></Screen>;
  const n = vm.numbers;

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
        {vm.canCreateTask ? (
          <Button mode="outlined" icon="creation-outline" onPress={onAssist}>
            Plan with Verida
          </Button>
        ) : null}
        {vm.canManageSettings ? (
          <Button icon="cog-outline" onPress={onOpenSettings}>
            Plan settings
          </Button>
        ) : null}
      </Row>
      <PendingSyncPanel sync={vm.sync} />
      <MetricGrid>
        <MetricCard index={0} label="Open tasks" value={formatQuantity(n?.openTasks ?? 0)} />
        <MetricCard index={1} label="Active goals" value={formatQuantity(n?.activeGoals ?? 0)} />
        <MetricCard index={2} label="Completed" value={formatQuantity(n?.completedInPeriod ?? 0)} caption="Last 7 days" />
        <MetricCard
          index={3}
          label="Overdue or blocked"
          value={formatQuantity((n?.overdueTasks ?? 0) + (n?.blockedTasks ?? 0))}
          status={(n?.overdueTasks ?? 0) + (n?.blockedTasks ?? 0) > 0 ? { label: 'Needs attention', tone: 'warn' } : undefined}
        />
      </MetricGrid>

      <Button compact icon={vm.mineOnly ? 'account-check' : 'account-multiple-outline'} onPress={vm.toggleMine}>
        {vm.mineOnly ? 'Showing my tasks only' : 'Showing everyone’s tasks'}
      </Button>
      <Panel style={styles.list}>
        <SectionHeader title="Today's focus" description="Overdue and due today first, then by priority." />
        <TaskRows items={vm.focus} onOpen={onOpenTask} empty="Nothing due. Add a task, or look at what is coming up." />
      </Panel>

      <SuggestionsPanel onAssist={onAssist} onOpenSuggestion={onOpenSuggestion} />

      <Panel style={styles.list}>
        <SectionHeader title="Active goals" />
        {vm.goals.length === 0 ? <Text style={styles.muted}>No active goals yet.</Text> : <GoalCards items={vm.goals} onOpen={onOpenGoal} />}
      </Panel>

      <Panel style={styles.list}>
        <SectionHeader
          title="Coming up"
          action={
            <Button compact icon="calendar-month-outline" onPress={onShowSchedule}>
              View schedule
            </Button>
          }
        />
        <SegmentedButtons value={vm.span} onValueChange={vm.setSpan} buttons={vm.spans} density="small" />
        {vm.events.map((event) => (
          <List.Item
            key={event.id}
            title={event.title}
            description={`${formatDate(event.onDate)} · ${event.when} · ${event.typeLabel}`}
            left={(p) => <List.Icon {...p} icon="calendar-clock-outline" />}
            onPress={() => onOpenEvent(event.id)}
          />
        ))}
        <TaskRows items={vm.upcoming} onOpen={onOpenTask} empty={vm.events.length > 0 ? '' : vm.span === 'today' ? 'Nothing due today.' : vm.span === 'tomorrow' ? 'Nothing due tomorrow.' : 'Nothing due this week.'} />
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
        <DateField label="Due from (optional)" value={vm.dueFrom} onChangeText={vm.setDueFrom} />
        <DateField label="Due until (optional)" value={vm.dueTo} onChangeText={vm.setDueTo} />
      </FieldGrid>
      <PendingSyncPanel sync={vm.sync} />
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

type TaskFormProps = { taskId?: string; goalId?: string; onDone: (id: string) => void; onSeriesCreated?: (ruleId: string) => void; onQueued?: () => void };

export function TaskFormScreen({ taskId, goalId, onDone, onSeriesCreated, onQueued }: TaskFormProps) {
  const vm = useTaskFormViewModel({ taskId, goalId, onDone, onSeriesCreated, onQueued });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen variant="form">
      <Panel>
        <FormField label="What needs doing?" value={values.title} onChangeText={(v) => setValue('title', v)} error={errors.title} />
        {vm.isOccurrence ? <Notice tone="info">{`This task repeats: ${vm.seriesSummary ?? ''}.`}</Notice> : null}
        {vm.canRepeat ? <SelectField label="Repeats" value={values.repeat} options={vm.repeatOptions} onChange={vm.setRepeat} /> : null}
        {vm.repeating ? (
          <>
            <FieldGrid>
              <DateField label="Starts on" value={values.startsOn} onChangeText={(v) => setValue('startsOn', v)} error={errors.startsOn} />
              <DateField label="Ends on (optional)" value={values.endsOn} onChangeText={(v) => setValue('endsOn', v)} error={errors.endsOn} />
              <FormField
                label={values.repeat === 'daily' ? 'Every how many days' : values.repeat === 'weekly' ? 'Every how many weeks' : 'Every how many months'}
                value={values.intervalCount}
                onChangeText={(v) => setValue('intervalCount', v)}
                error={errors.intervalCount}
                keyboardType="number-pad"
              />
              {values.repeat === 'monthly' ? (
                <FormField label="Day of the month" value={values.dayOfMonth} onChangeText={(v) => setValue('dayOfMonth', v)} error={errors.dayOfMonth} keyboardType="number-pad" hint="A short month uses its last day." />
              ) : null}
            </FieldGrid>
            {values.repeat === 'weekly' ? (
              <MultiSelectField label="On these days" values={vm.chosenWeekdays} options={vm.weekdayOptions} onChange={vm.setWeekdays} allowOther={false} allLabel="" emptyText="Choose days" error={errors.daysOfWeek} />
            ) : null}
            {vm.repeatSummary ? <Text style={styles.muted}>{`${vm.repeatSummary}. Each time becomes its own task, about a week ahead.`}</Text> : null}
          </>
        ) : null}
        <FieldGrid>
          {vm.repeating ? null : <DateField label="Due date (optional)" value={values.dueOn} onChangeText={(v) => setValue('dueOn', v)} error={errors.dueOn} />}
          <SelectField label="Priority" value={values.priority} options={vm.priorityOptions} onChange={(v) => setValue('priority', v as TaskPriority)} />
          <SelectField label="Assigned to" value={values.assignedTo} options={vm.assigneeOptions} onChange={(v) => setValue('assignedTo', v)} hint={vm.assigneeHint} />
          {vm.canRemind && !vm.repeating && values.dueOn ? <SelectField label="Remind me" value={vm.reminder} options={vm.reminderOptions} onChange={vm.setReminder} /> : null}
          {vm.isEditing ? <SelectField label="Status" value={values.status} options={vm.statusOptions} onChange={(v) => setValue('status', v as TaskStatus)} /> : null}
        </FieldGrid>
        {values.status === 'blocked' ? <FormField label="What is blocking it?" value={values.blockerReason} onChangeText={(v) => setValue('blockerReason', v)} error={errors.blockerReason} /> : null}
        {values.status === 'completed' ? <FormField label="Completion note (optional)" value={values.completionNote} onChangeText={(v) => setValue('completionNote', v)} error={errors.completionNote} /> : null}
        {vm.repeating ? null : (
          <MultiSelectField
            label="Goals it supports (optional)"
            values={vm.chosenGoals}
            options={vm.goalOptions}
            onChange={vm.setGoals}
            allowOther={false}
            allLabel=""
            emptyText="No goal"
          />
        )}
        <FormField label="Details (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} multiline />
      </Panel>
      {vm.isOccurrence && vm.seriesActive ? (
        <Panel>
          <SelectField
            label="Apply the title, priority, person and details to"
            value={vm.editScope}
            options={vm.scopeOptions}
            onChange={vm.setEditScope}
            hint="Status, due date and goals always change for this task only. Past tasks never change."
          />
        </Panel>
      ) : null}
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          {vm.isEditing ? (vm.editScope === 'series' ? 'Save for this and later tasks' : 'Save changes') : vm.repeating ? 'Add repeating task' : 'Add task'}
        </Button>
      ) : null}
    </Screen>
  );
}

type TaskProfileProps = { taskId: string; onEdit: () => void; onOpenGoal: (id: string) => void; onOpenSeries: (id: string) => void; onOpenSuggestion: (id: string) => void };

export function TaskProfileScreen({ taskId, onEdit, onOpenGoal, onOpenSeries, onOpenSuggestion }: TaskProfileProps) {
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
      {vm.pendingSync ? <Notice title="Waiting to sync">A change made without a connection is saved on this device and will be sent when you are back online.</Notice> : null}
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
      {vm.origin ? (
        <Panel style={styles.list}>
          <List.Item title={vm.origin.label} left={(p) => <List.Icon {...p} icon="creation-outline" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} onPress={() => onOpenSuggestion(vm.origin?.suggestionId ?? '')} />
        </Panel>
      ) : null}
      {vm.series ? (
        <Panel style={styles.list}>
          <List.Item
            title="Repeating task"
            description={vm.series.active ? vm.series.summary : `${vm.series.summary}. No longer repeats.`}
            left={(p) => <List.Icon {...p} icon="repeat" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => onOpenSeries(vm.series?.id ?? '')}
          />
        </Panel>
      ) : null}
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
      <TaskLinks vm={vm} />
      <TaskReminders vm={vm} />
      <TaskComments vm={vm} />
      <TaskHistory vm={vm} />
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

type TaskDetail = ReturnType<typeof useTaskDetailViewModel>;

// Section 4.3: the records a task is about. A link names the record and never copies an amount.
function TaskLinks({ vm }: { vm: TaskDetail }) {
  if (!vm.canLink && vm.links.length === 0) return null;
  return (
    <Panel style={styles.list}>
      <SectionHeader title="Related records" />
      {vm.links.length === 0 ? <Text style={styles.muted}>Not linked to any record.</Text> : null}
      {vm.links.map((link) => (
        <List.Item
          key={link.id}
          title={link.label}
          description={link.typeLabel}
          right={() => (vm.canLink ? <IconButton icon="close" size={18} onPress={() => vm.removeLink(link.id)} accessibilityLabel={`Remove the link to ${link.label}`} /> : null)}
        />
      ))}
      {vm.canLink ? (
        <View style={styles.inset}>
          <FieldGrid>
            <SelectField label="Link to" value={vm.linkType} options={vm.linkTypeOptions} onChange={vm.setLinkType} />
            {vm.linkType ? (
              <SelectField
                label="Record"
                value={vm.linkChoice}
                options={vm.linkChoiceOptions}
                onChange={vm.setLinkChoice}
                hint={vm.linkOptionsLoading ? 'Loading…' : vm.linkChoiceOptions.length === 0 ? 'Nothing recent to link.' : undefined}
              />
            ) : null}
          </FieldGrid>
          {vm.linkType ? (
            <Button mode="outlined" icon="link-variant" onPress={vm.addLink} loading={vm.addingLink} disabled={vm.addingLink || !vm.linkChoice}>
              Add link
            </Button>
          ) : null}
        </View>
      ) : null}
    </Panel>
  );
}

// Section 9: each person's own reminders. Snoozing or dismissing never moves the due date.
function TaskReminders({ vm }: { vm: TaskDetail }) {
  if (!vm.canRemind && vm.reminders.length === 0) return null;
  const custom = vm.reminderPreset === 'custom';
  return (
    <Panel style={styles.list}>
      <SectionHeader title="Remind me" description="Only you get these, in the app and by email if you allow it." />
      {vm.reminders.map((reminder) => (
        <View key={reminder.id} style={styles.inset}>
          <Row wrap>
            <Text style={styles.grow}>{formatDateTime(reminder.remindAt)}</Text>
            <StatusPill label={reminder.state.label} tone={reminder.state.tone} />
          </Row>
          {reminder.canSnooze ? (
            <Row wrap>
              {vm.snoozeChoices.map((choice) => (
                <Button key={choice.minutes} compact mode="outlined" onPress={() => vm.snooze(reminder.id, choice.minutes)}>
                  {`Snooze ${choice.label}`}
                </Button>
              ))}
              <Button compact onPress={() => vm.dismissReminder(reminder.id)}>
                Dismiss
              </Button>
            </Row>
          ) : null}
        </View>
      ))}
      {vm.canRemind ? (
        <View style={styles.inset}>
          <SelectField label="When" value={vm.reminderPreset} options={vm.reminderPresets} onChange={vm.setReminderPreset} />
          {custom ? (
            <FieldGrid>
              <DateField label="Day" value={vm.reminderForm.values.on} onChangeText={(v) => vm.reminderForm.setValue('on', v)} error={vm.reminderForm.errors.on} />
              <FormField label="Time (HH:MM)" value={vm.reminderForm.values.at} onChangeText={(v) => vm.reminderForm.setValue('at', v)} error={vm.reminderForm.errors.at} keyboardType="numbers-and-punctuation" />
            </FieldGrid>
          ) : null}
          <Button mode="outlined" icon="bell-plus-outline" onPress={vm.addReminder} loading={vm.settingReminder} disabled={vm.settingReminder}>
            Add reminder
          </Button>
        </View>
      ) : null}
    </Panel>
  );
}

function TaskComments({ vm }: { vm: TaskDetail }) {
  return (
    <Panel style={styles.list}>
      <SectionHeader title="Comments" />
      {vm.comments.length === 0 ? <Text style={styles.muted}>No comments yet.</Text> : null}
      {vm.comments.map((comment, index) => (
        <View key={comment.id}>
          {index > 0 ? <Divider /> : null}
          {vm.editingComment === comment.id ? (
            <View style={styles.inset}>
              <TextInput mode="outlined" value={vm.editText} onChangeText={vm.setEditText} multiline accessibilityLabel="Edit comment" />
              <Row>
                <Button compact mode="contained" onPress={vm.saveComment}>
                  Save
                </Button>
                <Button compact onPress={vm.cancelEditComment}>
                  Cancel
                </Button>
              </Row>
            </View>
          ) : (
            <List.Item
              title={comment.body}
              titleNumberOfLines={8}
              description={`${comment.author} · ${formatDateTime(comment.createdAt)}${comment.editedAt ? ' · edited' : ''}`}
              right={() =>
                comment.mine ? (
                  <View style={styles.rowEnd}>
                    <IconButton icon="pencil-outline" size={18} onPress={() => vm.startEditComment(comment.id, comment.body)} accessibilityLabel="Edit your comment" />
                    <IconButton icon="delete-outline" size={18} onPress={() => vm.removeComment(comment.id)} accessibilityLabel="Remove your comment" />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      ))}
      {vm.canComment ? (
        <View style={styles.inset}>
          <FormField label="Add a comment" value={vm.commentForm.values.body} onChangeText={(v) => vm.commentForm.setValue('body', v)} error={vm.commentForm.errors.body} multiline />
          <Button mode="outlined" onPress={vm.addComment} loading={vm.addingComment} disabled={vm.addingComment}>
            Post comment
          </Button>
        </View>
      ) : null}
    </Panel>
  );
}

// Section 4.3: status changes and material edits, from the audit log.
function TaskHistory({ vm }: { vm: TaskDetail }) {
  return (
    <Panel style={styles.list}>
      <SectionHeader
        title="History"
        action={
          <Button compact onPress={vm.toggleHistory}>
            {vm.showHistory ? 'Hide' : 'Show'}
          </Button>
        }
      />
      {vm.historyLoading ? <LoadingView /> : null}
      {vm.showHistory && !vm.historyLoading && vm.history.length === 0 ? <Text style={styles.muted}>No changes recorded.</Text> : null}
      {vm.showHistory
        ? vm.history.map((entry) => (
            <List.Item key={entry.key} title={entry.lines.join('\n') || 'Updated the task'} titleNumberOfLines={8} description={`${entry.who} · ${formatDateTime(entry.when)}`} />
          ))
        : null}
    </Panel>
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

type GoalProfileProps = { goalId: string; onEdit: () => void; onOpenTask: (id: string) => void; onAddTask: () => void; onAssist: () => void };

export function GoalProfileScreen({ goalId, onEdit, onOpenTask, onAddTask, onAssist }: GoalProfileProps) {
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

      <Panel style={styles.list}>
        <SectionHeader title="Related measures" description="Figures from your records over the goal's period so far. They give context; they do not prove what moved the goal." />
        {vm.measures.length === 0 ? <Text style={styles.muted}>No related measures yet.</Text> : null}
        {vm.measures.map((measure) => (
          <List.Item
            key={measure.code}
            title={`${measure.name}: ${measure.display}${measure.estimated ? ' (estimated)' : ''}`}
            description={[measure.period, measure.note].filter(Boolean).join(' · ')}
            descriptionNumberOfLines={3}
            right={() => (vm.canManage ? <IconButton icon="close" size={18} onPress={() => vm.removeMeasure(measure.code)} accessibilityLabel={`Remove ${measure.name}`} /> : null)}
          />
        ))}
        {vm.canManage && vm.measureOptions.length > 0 ? (
          <View style={styles.inset}>
            <SelectField label="Add a measure" value={vm.measureChoice} options={vm.measureOptions} onChange={vm.setMeasureChoice} />
            <Button mode="outlined" onPress={vm.addMeasure} disabled={!vm.measureChoice}>
              Add measure
            </Button>
          </View>
        ) : null}
      </Panel>

      {vm.measurable && vm.observations.length > 0 ? (
        <Panel style={styles.list}>
          <SectionHeader title="Progress history" description="Each value recorded by your team, newest first." />
          {vm.observations.map((entry, index) => (
            <View key={entry.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={`${formatQuantity(entry.actualValue)}${goal.unit ? ` ${goal.unit}` : ''}`}
                description={[formatDate(entry.recordedOn), entry.recordedBy, entry.note].filter(Boolean).join(' · ')}
                descriptionNumberOfLines={3}
              />
            </View>
          ))}
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
              <Row gap={spacing.xs}>
                <Button compact icon="creation-outline" onPress={onAssist}>
                  Break into steps
                </Button>
                <Button compact icon="plus" onPress={onAddTask}>
                  Add task
                </Button>
              </Row>
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
  // The row keeps its natural height, and chips keep theirs, on a wide web window too.
  chipRow: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: spacing.xs, paddingVertical: spacing.xs, alignItems: 'center' },
});
