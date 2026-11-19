import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Divider, IconButton, List, SegmentedButtons, Text } from 'react-native-paper';

import { formatDate, formatQuantity } from '@/core/format/format';
import {
  Button,
  ConfirmDialog,
  DateField,
  DetailPanel,
  EmptyState,
  ErrorView,
  FieldGrid,
  FormField,
  LoadingView,
  MultiSelectField,
  Notice,
  Panel,
  ProfileHeader,
  Row,
  Screen,
  SectionHeader,
  SelectField,
  StatusPill,
  palette,
  radius,
  spacing,
  supporting,
  type StatusTone,
} from '@/design-system';

import { WEEKDAY_SHORT, type EventStatus, type EventType } from '../../domain/schedule';
import type { TaskPriority } from '../../domain/models';
import {
  useEventDetailViewModel,
  useEventFormViewModel,
  useProgressViewModel,
  useReviewFormViewModel,
  useReviewViewModel,
  useScheduleViewModel,
  useSeriesDetailViewModel,
  useSeriesFormViewModel,
  type ScheduleRow,
} from '../viewmodels/useScheduleViewModels';
import { PendingSyncPanel } from './assistScreens';
import { GoalCards, PRIORITY_TONES, TaskRows, partStyles } from './planParts';

const EVENT_TONES: Record<EventStatus, StatusTone> = { scheduled: 'neutral', done: 'ok', cancelled: 'neutral' };
const EVENT_ICONS: Record<EventType, string> = {
  meeting: 'account-group-outline',
  delivery: 'truck-delivery-outline',
  appointment: 'calendar-account-outline',
  deadline: 'flag-checkered',
  other: 'calendar-blank-outline',
};

type SectionProps = {
  header: ReactNode;
  onNewTask: () => void;
  onNewEvent: (onDate?: string) => void;
  onOpenTask: (id: string) => void;
  onOpenGoal: (id: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenSeries: (id: string) => void;
  onOpenReview: (weekStart: string) => void;
};

function ScheduleRows({ rows, onOpenTask, onOpenEvent, onOpenSeries }: { rows: ScheduleRow[] } & Pick<SectionProps, 'onOpenTask' | 'onOpenEvent' | 'onOpenSeries'>) {
  return (
    <>
      {rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 ? <Divider /> : null}
          <List.Item
            title={row.title}
            titleStyle={row.closed ? partStyles.struck : undefined}
            description={[row.kind === 'event' ? `${row.when} · ${row.typeLabel ?? ''}` : row.when, row.assignee, row.overdue ? 'Overdue' : null].filter(Boolean).join(' · ')}
            descriptionStyle={row.overdue ? partStyles.overdue : undefined}
            left={(p) => <List.Icon {...p} icon={row.kind === 'event' ? 'calendar-clock-outline' : row.kind === 'projected' ? 'repeat' : 'checkbox-blank-circle-outline'} />}
            right={() => (
              <View style={partStyles.rowEnd}>
                {row.priority === 'urgent' || row.priority === 'high' ? <StatusPill label={row.priorityLabel ?? ''} tone={PRIORITY_TONES[row.priority as TaskPriority]} /> : null}
                {row.kind !== 'task' || row.statusLabel !== 'Not started' ? <StatusPill label={row.statusLabel} tone="neutral" /> : null}
              </View>
            )}
            onPress={() => {
              if (row.kind === 'event' && row.id) onOpenEvent(row.id);
              else if (row.kind === 'task' && row.id) onOpenTask(row.id);
              else if (row.ruleId) onOpenSeries(row.ruleId);
            }}
          />
        </View>
      ))}
    </>
  );
}

// Section 4.4: tasks and events by day. Later occurrences of a repeating task show as
// "Repeats" until they become tasks of their own.
export function ScheduleSection({ header, onNewTask, onNewEvent, onOpenTask, onOpenEvent, onOpenSeries }: SectionProps) {
  const vm = useScheduleViewModel();
  if (!vm.canView) return <Screen>{header}<Notice tone="info">You do not have access to this business&apos;s plan.</Notice></Screen>;
  const open = { onOpenTask, onOpenEvent, onOpenSeries };

  return (
    <Screen>
      {header}
      {vm.canCreate ? (
        <Row wrap>
          <Button mode="contained" icon="plus" onPress={onNewTask}>
            New task
          </Button>
          <Button mode="outlined" icon="calendar-plus" onPress={() => onNewEvent(vm.view === 'month' ? vm.selectedDay : undefined)}>
            New event
          </Button>
        </Row>
      ) : null}
      <PendingSyncPanel sync={vm.sync} />
      <SegmentedButtons value={vm.view} onValueChange={vm.setView} buttons={vm.views} density="small" />
      <Row>
        <IconButton icon="chevron-left" onPress={vm.previous} accessibilityLabel="Earlier" />
        <Text variant="titleMedium" style={styles.title}>
          {vm.title}
        </Text>
        <IconButton icon="chevron-right" onPress={vm.next} accessibilityLabel="Later" />
      </Row>
      <Button compact onPress={vm.goToToday}>
        Today
      </Button>

      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.view === 'month' ? (
        <>
          <Panel style={styles.grid}>
            <View style={styles.week}>
              {WEEKDAY_SHORT.map((day) => (
                <Text key={day} style={styles.weekday}>
                  {day}
                </Text>
              ))}
            </View>
            {vm.month.map((week) => (
              <View key={week[0]?.day} style={styles.week}>
                {week.map((cell) => (
                  <Pressable
                    key={cell.day}
                    onPress={() => vm.selectDay(cell.day)}
                    style={[styles.cell, cell.selected && styles.cellSelected, cell.isToday && styles.cellToday]}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatDate(cell.day)}, ${cell.count === 0 ? 'nothing open' : `${cell.count} open`}`}
                  >
                    <Text style={[styles.cellLabel, !cell.inMonth && styles.outside]}>{cell.label}</Text>
                    {cell.count > 0 ? <View style={styles.dot} /> : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </Panel>
          <Panel style={styles.list}>
            <SectionHeader title={formatDate(vm.selectedDay)} />
            {vm.selectedRows.length === 0 ? <Text style={partStyles.muted}>Nothing on this day.</Text> : <ScheduleRows rows={vm.selectedRows} {...open} />}
          </Panel>
        </>
      ) : vm.isEmpty ? (
        <EmptyState illustration="done" title="Nothing scheduled." description="Tasks with a due date, repeating tasks and events appear here." />
      ) : (
        vm.days.map((group) => (
          <Panel key={group.day} style={styles.list}>
            <SectionHeader title={`${group.weekday} ${formatDate(group.day)}${group.isToday ? ' · Today' : ''}`} />
            <ScheduleRows rows={group.rows} {...open} />
          </Panel>
        ))
      )}
    </Screen>
  );
}

// Section 4.5: how the team kept its commitments, goal progress and weekly reviews.
export function ProgressSection({ header, onOpenGoal, onOpenReview }: SectionProps) {
  const vm = useProgressViewModel();
  if (!vm.canView) return <Screen>{header}<Notice tone="info">You do not have access to this business&apos;s plan.</Notice></Screen>;
  if (vm.loading) return <Screen>{header}<LoadingView /></Screen>;
  if (vm.error) return <Screen>{header}<ErrorView message={vm.error} onRetry={vm.retry} /></Screen>;
  const n = vm.numbers;
  const rate = (value: number | null | undefined) => (value === null || value === undefined ? 'No data' : `${value}%`);

  return (
    <Screen>
      {header}
      <Panel>
        <SectionHeader title="Tasks" description="How the team kept its commitments. This does not show whether business figures improved." />
        <SelectField label="Period" value={vm.period} options={vm.periodOptions} onChange={vm.setPeriod} />
        <DetailPanel
          rows={[
            { label: 'Tasks due in the period', value: formatQuantity(n?.eligibleDue ?? 0), half: true },
            { label: 'Completion rate', value: rate(n?.completionRate), half: true },
            { label: 'Completed on time', value: rate(n?.onTimeRate), half: true },
            { label: 'Completed', value: formatQuantity(n?.completedInPeriod ?? 0), half: true },
            { label: 'Overdue now', value: formatQuantity(n?.overdueTasks ?? 0), half: true },
            { label: 'Blocked now', value: formatQuantity(n?.blockedTasks ?? 0), half: true },
          ]}
        />
        <Text style={partStyles.muted}>Cancelled tasks are left out. A rescheduled task counts on its current due date. Rates show only when there is something to count.</Text>
      </Panel>

      <Panel style={styles.list}>
        <SectionHeader title="Goals" description="Progress comes from your records or from values your team recorded, never from finishing tasks." />
        {vm.goals.length === 0 ? <Text style={partStyles.muted}>No goals yet.</Text> : <GoalCards items={vm.goals} onOpen={onOpenGoal} />}
      </Panel>

      <Panel style={styles.list}>
        <SectionHeader title="Weekly reviews" description="What was done, what was not, what got in the way and what comes next." />
        {vm.reviewWeeks.map((week) => (
          <List.Item
            key={week.start}
            title={week.label}
            description={`Week of ${formatDate(week.start)}${week.written ? ' · Review written' : ''}`}
            left={(p) => <List.Icon {...p} icon={week.written ? 'clipboard-check-outline' : 'clipboard-text-outline'} />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => onOpenReview(week.start)}
          />
        ))}
        {vm.reviews.filter((review) => !vm.reviewWeeks.some((week) => week.start === review.start)).map((review) => (
          <List.Item
            key={review.start}
            title={`Week of ${formatDate(review.start)}`}
            description={review.preview}
            descriptionNumberOfLines={2}
            onPress={() => onOpenReview(review.start)}
          />
        ))}
      </Panel>
    </Screen>
  );
}

// ---------------------------------------------------------------------------------------------
// Events.

type EventFormProps = { eventId?: string; onDate?: string; onDone: (id: string) => void; onSeriesCreated?: (ruleId: string) => void; onQueued?: () => void };

export function EventFormScreen({ eventId, onDate, onDone, onSeriesCreated, onQueued }: EventFormProps) {
  const vm = useEventFormViewModel({ eventId, onDate, onDone, onSeriesCreated, onQueued });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;
  return (
    <Screen variant="form">
      <Panel>
        <FormField label="What is happening?" value={values.title} onChangeText={(v) => setValue('title', v)} error={errors.title} hint="For example: Feed delivery from the supplier." />
        <FieldGrid>
          <SelectField label="Kind" value={values.eventType} options={vm.typeOptions} onChange={(v) => setValue('eventType', v)} />
          <DateField label="Day" value={values.startsOn} onChangeText={(v) => setValue('startsOn', v)} error={errors.startsOn} />
          <FormField label="Starts (HH:MM, optional)" value={values.startTime} onChangeText={(v) => setValue('startTime', v)} error={errors.startTime} keyboardType="numbers-and-punctuation" />
          <FormField label="Ends (HH:MM, optional)" value={values.endTime} onChangeText={(v) => setValue('endTime', v)} error={errors.endTime} keyboardType="numbers-and-punctuation" />
          {vm.isEditing ? <SelectField label="Status" value={values.status} options={vm.statusOptions} onChange={(v) => setValue('status', v)} /> : null}
        </FieldGrid>
        <Text style={partStyles.muted}>Times are in your business&apos;s own time zone. Leave them empty for an all-day event.</Text>
        {vm.canRepeat ? <SelectField label="Repeats" value={values.repeat} options={vm.repeatOptions} onChange={vm.setRepeat} /> : null}
        {values.repeat !== 'none' ? (
          <>
            <FieldGrid>
              <FormField
                label={values.repeat === 'daily' ? 'Every how many days' : values.repeat === 'weekly' ? 'Every how many weeks' : 'Every how many months'}
                value={values.intervalCount}
                onChangeText={(v) => setValue('intervalCount', v)}
                error={errors.intervalCount}
                keyboardType="number-pad"
              />
              {values.repeat === 'monthly' ? (
                <FormField label="Day of the month" value={values.dayOfMonth} onChangeText={(v) => setValue('dayOfMonth', v)} error={errors.dayOfMonth} keyboardType="number-pad" />
              ) : null}
              <DateField label="Ends on (optional)" value={values.endsOn} onChangeText={(v) => setValue('endsOn', v)} error={errors.endsOn} />
            </FieldGrid>
            {values.repeat === 'weekly' ? (
              <MultiSelectField label="On these days" values={vm.chosenWeekdays} options={vm.weekdayOptions} onChange={vm.setWeekdays} allowOther={false} allLabel="" emptyText="Choose days" error={errors.daysOfWeek} />
            ) : null}
            {vm.repeatSummary ? <Text style={partStyles.muted}>{`${vm.repeatSummary}, starting on the day above.`}</Text> : null}
          </>
        ) : null}
        <FormField label="Details (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} multiline />
      </Panel>
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          {vm.isEditing ? 'Save changes' : values.repeat !== 'none' ? 'Add repeating event' : 'Add to schedule'}
        </Button>
      ) : null}
    </Screen>
  );
}

export function EventProfileScreen({ eventId, onEdit, onOpenSeries }: { eventId: string; onEdit: () => void; onOpenSeries: (id: string) => void }) {
  const vm = useEventDetailViewModel(eventId);
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.event) return <ErrorView message={vm.error ?? 'This event could not be found.'} />;
  const { event } = vm;
  return (
    <Screen>
      <ProfileHeader
        icon={EVENT_ICONS[event.eventType]}
        tone="neutral"
        title={event.title}
        subtitle={`${formatDate(event.startsOn)} · ${vm.when}`}
        struckThrough={event.status === 'cancelled'}
        status={{ label: vm.statusLabel, tone: EVENT_TONES[event.status] }}
      />
      <DetailPanel
        rows={[
          { label: 'Kind', value: vm.typeLabel, half: true },
          { label: 'When', value: vm.when, half: true },
          { label: 'Details', value: event.description },
        ]}
      />
      {event.ruleId ? (
        <Panel style={styles.list}>
          <List.Item title="Repeating event" description="See the whole series" left={(p) => <List.Icon {...p} icon="repeat" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} onPress={() => onOpenSeries(event.ruleId ?? '')} />
        </Panel>
      ) : null}
      <Row wrap>
        {vm.canMarkDone ? (
          <Button mode="contained" icon="check" onPress={vm.markDone} disabled={vm.busy}>
            Mark as done
          </Button>
        ) : null}
        {vm.canRestore ? (
          <Button mode="outlined" onPress={vm.restore} disabled={vm.busy}>
            Back to scheduled
          </Button>
        ) : null}
      </Row>
      {vm.canEdit ? (
        <Button icon="pencil-outline" onPress={onEdit}>
          Edit event
        </Button>
      ) : null}
      {vm.canCancel ? (
        <Button onPress={vm.cancel} disabled={vm.busy} textColor={supporting.error}>
          Cancel this event
        </Button>
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------------------------
// Repeating series.

export function SeriesProfileScreen({ ruleId, onEdit, onOpenTask, onOpenEvent }: { ruleId: string; onEdit: () => void; onOpenTask: (id: string) => void; onOpenEvent: (id: string) => void }) {
  const vm = useSeriesDetailViewModel(ruleId);
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.rule) return <ErrorView message={vm.error ?? 'This repeating task could not be found.'} />;
  const { rule } = vm;
  return (
    <Screen>
      <ProfileHeader icon="repeat" tone="neutral" title={rule.title} subtitle={vm.summary} status={{ label: vm.active ? 'Repeating' : 'Ended', tone: vm.active ? 'ok' : 'neutral' }} />
      <DetailPanel
        rows={[
          { label: 'Starts', value: formatDate(rule.startsOn), half: true },
          { label: 'Ends', value: rule.endsOn ? formatDate(rule.endsOn) : 'No end date', half: true },
          { label: 'Priority', value: vm.isEventSeries ? null : vm.priorityLabel, half: true },
          { label: 'Assigned to', value: vm.isEventSeries ? null : (vm.assignee ?? 'Nobody yet'), half: true },
          { label: 'Details', value: rule.description },
        ]}
      />
      <Notice tone="info">{`Each time becomes its own ${vm.isEventSeries ? 'event' : 'task'} about a week ahead, so changing one never affects the others.`}</Notice>
      {vm.isEventSeries ? (
        <Panel style={styles.list}>
          <SectionHeader title={`Events · ${vm.eventWhen}`} />
          {vm.events.length === 0 ? <Text style={partStyles.muted}>None yet.</Text> : null}
          {vm.events.map((event) => (
            <List.Item key={event.id} title={formatDate(event.startsOn)} description={`${event.when} · ${event.statusLabel}`} titleStyle={event.past ? partStyles.struck : undefined} onPress={() => onOpenEvent(event.id)} />
          ))}
        </Panel>
      ) : (
        <Panel style={styles.list}>
          <SectionHeader title="Coming up" />
          <TaskRows items={vm.upcoming} onOpen={onOpenTask} empty="Nothing open yet." />
        </Panel>
      )}
      {!vm.isEventSeries && vm.past.length > 0 ? (
        <Panel style={styles.list}>
          <SectionHeader title="Earlier" />
          <TaskRows items={vm.past} onOpen={onOpenTask} empty="" />
        </Panel>
      ) : null}
      {vm.canManage ? (
        <>
          <Button icon="pencil-outline" onPress={onEdit}>
            Edit the series
          </Button>
          <Button onPress={vm.askToEnd} textColor={supporting.error}>
            Stop repeating
          </Button>
        </>
      ) : null}
      <ConfirmDialog
        visible={vm.confirmingEnd}
        title="Stop repeating this task?"
        message="Later ones that nobody has started or changed are cancelled. Today's and everything already done stay as they are."
        confirmLabel="Stop repeating"
        destructive
        busy={vm.ending}
        onDismiss={vm.cancelEnd}
        onConfirm={vm.confirmEnd}
      />
    </Screen>
  );
}

export function SeriesFormScreen({ ruleId, onDone }: { ruleId: string; onDone: () => void }) {
  const vm = useSeriesFormViewModel({ ruleId, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;
  return (
    <Screen variant="form">
      <Notice tone="info">{`${vm.summary}. Changes apply to later tasks that nobody has started or changed on their own. To repeat on a different pattern, stop this series and add a new one.`}</Notice>
      <Panel>
        <FormField label="What needs doing?" value={values.title} onChangeText={(v) => setValue('title', v)} error={errors.title} />
        <FieldGrid>
          {vm.isEventSeries ? null : <SelectField label="Priority" value={values.priority} options={vm.priorityOptions} onChange={(v) => setValue('priority', v)} />}
          {vm.isEventSeries ? null : <SelectField label="Assigned to" value={values.assignedTo} options={vm.assigneeOptions} onChange={(v) => setValue('assignedTo', v)} />}
          <DateField label="Ends on (optional)" value={values.endsOn} onChangeText={(v) => setValue('endsOn', v)} error={errors.endsOn} />
        </FieldGrid>
        <FormField label="Details (optional)" value={values.description} onChangeText={(v) => setValue('description', v)} error={errors.description} multiline />
      </Panel>
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          Save for later tasks
        </Button>
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------------------------------------
// Weekly reviews.

type ReviewProps = { weekStart: string; onEdit: () => void; onOpenTask: (id: string) => void; onAddTask: () => void };

export function ReviewScreen({ weekStart, onEdit, onOpenTask, onAddTask }: ReviewProps) {
  const vm = useReviewViewModel(weekStart);
  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} />;
  const n = vm.numbers;
  const rate = (value: number | null | undefined) => (value === null || value === undefined ? 'No data' : `${value}%`);
  const notes = vm.review;

  return (
    <Screen>
      <ProfileHeader icon="clipboard-text-outline" tone="neutral" title={`Week of ${formatDate(vm.start)}`} subtitle={`${formatDate(vm.start)} to ${formatDate(vm.end)}`} status={notes ? { label: 'Reviewed', tone: 'ok' } : { label: 'Not reviewed yet', tone: 'neutral' }} />
      <DetailPanel
        rows={[
          { label: 'Tasks due this week', value: formatQuantity(n?.eligibleDue ?? 0), half: true },
          { label: 'Completion rate', value: rate(n?.completionRate), half: true },
          { label: 'Completed on time', value: rate(n?.onTimeRate), half: true },
          { label: 'Completed this week', value: formatQuantity(vm.completed.length), half: true },
        ]}
      />
      <Panel style={styles.list}>
        <SectionHeader title="Completed" />
        <TaskRows items={vm.completed} onOpen={onOpenTask} empty="Nothing was completed this week." />
      </Panel>
      <Panel style={styles.list}>
        <SectionHeader title="Not finished" description="Due by the end of the week and still open." />
        <TaskRows items={vm.unfinished} onOpen={onOpenTask} empty="Nothing left over." />
      </Panel>
      {vm.blocked.length > 0 ? (
        <Panel style={styles.list}>
          <SectionHeader title="Blocked now" />
          <TaskRows items={vm.blocked} onOpen={onOpenTask} empty="" />
        </Panel>
      ) : null}
      <Panel style={styles.list}>
        <SectionHeader
          title="Coming up next week"
          action={
            vm.canAddTask ? (
              <Button compact icon="plus" onPress={onAddTask}>
                Add task
              </Button>
            ) : undefined
          }
        />
        <TaskRows items={vm.upcoming} onOpen={onOpenTask} empty="Nothing due yet." />
      </Panel>
      <DetailPanel
        title="Notes"
        rows={[
          { label: 'Summary', value: notes?.summary ?? null },
          { label: 'Wins', value: notes?.wins ?? null },
          { label: 'What got in the way', value: notes?.blockers ?? null },
          { label: 'Next priorities', value: notes?.nextPriorities ?? null },
        ]}
      />
      {!notes ? <Text style={partStyles.muted}>No notes yet.</Text> : null}
      {vm.canEdit ? (
        <Button mode={notes ? 'text' : 'contained'} icon="pencil-outline" onPress={onEdit}>
          {notes ? 'Edit notes' : 'Write the review'}
        </Button>
      ) : null}
    </Screen>
  );
}

export function ReviewFormScreen({ weekStart, onDone }: { weekStart: string; onDone: () => void }) {
  const vm = useReviewFormViewModel({ periodStart: weekStart, onDone });
  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;
  return (
    <Screen variant="form">
      <Notice tone="info">{`Week of ${formatDate(vm.start)} to ${formatDate(vm.end)}.`}</Notice>
      <Panel>
        <FormField label="How did the week go?" value={values.summary} onChangeText={(v) => setValue('summary', v)} error={errors.summary} multiline />
        <FormField label="Wins" value={values.wins} onChangeText={(v) => setValue('wins', v)} error={errors.wins} multiline />
        <FormField label="What got in the way" value={values.blockers} onChangeText={(v) => setValue('blockers', v)} error={errors.blockers} multiline />
        <FormField label="Next priorities" value={values.nextPriorities} onChangeText={(v) => setValue('nextPriorities', v)} error={errors.nextPriorities} multiline hint="Turn any of these into tasks from the review." />
      </Panel>
      {vm.canSave ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          Save review
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xs, gap: 0 },
  title: { flex: 1, textAlign: 'center', color: palette.deepTeal },
  grid: { padding: spacing.sm, gap: spacing.xs },
  week: { flexDirection: 'row', gap: spacing.xs },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: supporting.mutedText },
  cell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, gap: 2 },
  cellSelected: { backgroundColor: palette.softMint },
  cellToday: { borderWidth: 1, borderColor: palette.teal },
  cellLabel: { color: supporting.ink },
  outside: { color: supporting.mutedText, opacity: 0.6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.mutedCoral },
});
