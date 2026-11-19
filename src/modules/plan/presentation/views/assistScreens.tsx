import { StyleSheet, View } from 'react-native';
import { Divider, List, Switch, Text } from 'react-native-paper';

import {
  Button,
  DateField,
  ErrorView,
  FieldGrid,
  FormField,
  LoadingView,
  Notice,
  Panel,
  ProfileHeader,
  Row,
  Screen,
  SectionHeader,
  SelectField,
  StatusPill,
  palette,
  spacing,
  supporting,
} from '@/design-system';

import type { FocusInsight, SuggestionKind } from '../../domain/assist';
import { usePlanAssistViewModel, usePlanSettingsViewModel, useSuggestionViewModel, useSuggestionsPanelViewModel } from '../viewmodels/useAssistViewModels';
import type { PlanSync } from '../viewmodels/usePlanSync';
import { partStyles } from './planParts';

// ---------------------------------------------------------------------------------------------
// Section 1 wireframe: "A suggestion from Verida", kept apart from confirmed work and labelled.

type PanelProps = { onAssist: () => void; onOpenSuggestion: (id: string) => void; onAskVerida: (question: string) => void };

export function SuggestionsPanel({ onAssist, onOpenSuggestion, onAskVerida }: PanelProps) {
  const vm = useSuggestionsPanelViewModel();
  if (!vm.canAsk && !vm.hasAny) return null;
  const top = vm.top;
  return (
    <Panel tone="mint" style={styles.panel}>
      <SectionHeader
        title="✦ A suggestion from Verida"
        description="Suggestions are not part of your plan until you accept them."
        action={
          vm.canAsk ? (
            <Button compact icon="creation-outline" onPress={onAssist}>
              Plan with Verida
            </Button>
          ) : undefined
        }
      />
      {top ? (
        <View style={styles.inset}>
          <Text variant="titleSmall">{top.title}</Text>
          <Text style={partStyles.muted}>{top.generator === 'ai' ? 'Drafted by Verida’s AI' : 'From Verida’s built-in rules'}</Text>
          <Text>{`${top.action.verb}: ${top.action.heading}`}</Text>
          {top.action.detail ? <Text style={partStyles.muted}>{top.action.detail}</Text> : null}
          {top.action.why ? <Text style={partStyles.muted}>{`Why: ${top.action.why}`}</Text> : null}
          <Row wrap>
            {top.action.canAccept ? (
              <Button compact mode="contained" onPress={() => vm.accept(top.action.id)} disabled={vm.busy}>
                {top.action.verb}
              </Button>
            ) : null}
            <Button compact mode="outlined" onPress={() => vm.dismiss(top.action.id)} disabled={vm.busy}>
              Dismiss
            </Button>
            <Button compact icon="creation-outline" onPress={() => onAskVerida(top.askQuestion)}>
              Ask Verida
            </Button>
            <Button compact onPress={() => onOpenSuggestion(top.suggestionId)}>
              {top.remaining > 1 ? `See all ${top.remaining}` : 'Details'}
            </Button>
          </Row>
        </View>
      ) : (
        <Text style={partStyles.muted}>Ask Verida to help plan your week, break a goal into steps, or turn your figures into actions.</Text>
      )}
      {vm.others.map((other) => (
        <List.Item key={other.id} title={other.title} description={`${other.waiting} waiting for you`} left={(p) => <List.Icon {...p} icon="creation-outline" />} onPress={() => onOpenSuggestion(other.id)} />
      ))}
    </Panel>
  );
}

// Section 8: changes still on this device, and any that need a decision.
export function PendingSyncPanel({ sync }: { sync: PlanSync }) {
  if (sync.pending.length === 0 && !sync.offline) return null;
  return (
    <Panel style={styles.panel}>
      <SectionHeader
        title={sync.offline ? 'Offline' : 'Waiting to sync'}
        description={sync.offline ? 'Changes are saved on this device and will be sent when you are back online.' : 'These changes are on this device and have not reached Verida yet.'}
        action={
          <Button compact icon="sync" onPress={sync.syncNow} loading={sync.syncing} disabled={sync.syncing}>
            Sync now
          </Button>
        }
      />
      {sync.pending.map((item, index) => (
        <View key={item.clientId}>
          {index > 0 ? <Divider /> : null}
          <List.Item title={item.title} description={item.error ?? item.detail} descriptionStyle={item.conflict || item.error ? partStyles.overdue : undefined} descriptionNumberOfLines={3} />
          {item.conflict ? (
            <Row wrap>
              <Button compact mode="contained" onPress={() => void sync.keepMine(item.clientId)}>
                Keep my change
              </Button>
              <Button compact mode="outlined" onPress={() => void sync.discard(item.clientId)}>
                Keep theirs
              </Button>
            </Row>
          ) : item.error ? (
            <Button compact onPress={() => void sync.discard(item.clientId)}>
              Discard
            </Button>
          ) : null}
        </View>
      ))}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// Section 4.6 and journeys 5.2 and 5.3: asking Verida for help.

type AssistProps = { kind?: SuggestionKind; goalId?: string; insight?: FocusInsight; onDone: (suggestionId: string) => void };

export function PlanAssistScreen({ kind, goalId, insight, onDone }: AssistProps) {
  const vm = usePlanAssistViewModel({ kind, goalId, insight, onDone });
  if (!vm.canAsk) return <Screen><Notice tone="info">You need permission to work on tasks to ask Verida for a plan.</Notice></Screen>;
  return (
    <Screen variant="form">
      <Notice tone="info">Verida drafts suggestions from your goals, tasks, schedule and figures. Nothing is added to your plan until you accept it.</Notice>
      <Panel>
        <SelectField label="What would you like?" value={vm.kind} options={vm.kindOptions} onChange={vm.setKind} />
        {vm.insight ? (
          <Notice title="From your insight">{`${vm.insight.title}${vm.insight.evidence ? ` (based on: ${vm.insight.evidence})` : ''}`}</Notice>
        ) : null}
        {vm.kind === 'goal_breakdown' ? <SelectField label="Goal" value={vm.goal} options={vm.goalOptions} onChange={vm.setGoal} hint={vm.goalOptions.length === 0 ? 'Create a goal first.' : undefined} /> : null}
        <FormField label={vm.requestLabel} value={vm.request} onChangeText={vm.setRequest} multiline hint={vm.kind === 'weekly_plan' ? 'For example: free mornings, market on Saturday.' : undefined} />
      </Panel>
      <Button mode="contained" icon="creation-outline" onPress={vm.submit} loading={vm.asking} disabled={vm.asking}>
        Get suggestions
      </Button>
      <Text style={partStyles.muted}>Only the information needed is used, and no names of people are sent. If the AI is unavailable, Verida’s built-in rules suggest from your own plan instead.</Text>
    </Screen>
  );
}

type SuggestionProps = {
  suggestionId: string;
  onAskVerida: (question: string) => void;
  onReplaced: (id: string) => void;
  onOpenTask: (id: string) => void;
  onOpenGoal: (id: string) => void;
  onOpenEvent: (id: string) => void;
};

export function SuggestionScreen({ suggestionId, onReplaced, onOpenTask, onOpenGoal, onOpenEvent, onAskVerida }: SuggestionProps) {
  const vm = useSuggestionViewModel(suggestionId, { onReplaced });
  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.suggestion) return <ErrorView message={vm.error ?? 'This suggestion could not be found.'} />;
  const s = vm.suggestion;
  const draft = vm.draft;

  return (
    <Screen>
      <ProfileHeader icon="creation-outline" tone="neutral" title={s.title} subtitle={vm.kindLabel} status={{ label: 'Suggestion', tone: 'warn' }} />
      <Notice tone="info">{vm.origin}</Notice>
      {vm.statusNote ? <Notice title="No longer open">{vm.statusNote}</Notice> : null}
      <Panel>
        <Text>{s.explanation}</Text>
        {vm.insightTitle ? <Text style={partStyles.muted}>{`From your insight: ${vm.insightTitle}`}</Text> : null}
        {s.request ? <Text style={partStyles.muted}>{`You asked: ${s.request}`}</Text> : null}
        {vm.period ? <Text style={partStyles.muted}>{`Period: ${vm.period}`}</Text> : null}
        {s.assumptions ? <Text style={partStyles.muted}>{`Assumptions: ${s.assumptions}`}</Text> : null}
        {s.limitations ? <Text style={partStyles.muted}>{`What the data does not show: ${s.limitations}`}</Text> : null}
      </Panel>

      <Panel style={styles.panel}>
        <SectionHeader title="Proposed actions" description="Accept, change or dismiss each one. Accepting adds it to your plan." />
        {vm.actions.map((action, index) => (
          <View key={action.id}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.inset}>
              <Row>
                <Text style={styles.grow} variant="titleSmall">{`${action.verb}: ${action.heading}`}</Text>
                {!action.open ? <StatusPill label={action.statusLabel} tone={action.status === 'dismissed' ? 'neutral' : 'ok'} /> : null}
              </Row>
              {action.detail ? <Text style={partStyles.muted}>{action.detail}</Text> : null}
              {action.why ? <Text style={partStyles.muted}>{`Why: ${action.why}`}</Text> : null}

              {vm.editing === action.id && draft ? (
                <View style={styles.edit}>
                  {action.type !== 'update_task' ? <FormField label="Title" value={draft.title} onChangeText={(v) => vm.setDraftField('title', v)} /> : null}
                  <FieldGrid>
                    {action.type === 'create_event' ? (
                      <>
                        <DateField label="Day" value={draft.startsOn} onChangeText={(v) => vm.setDraftField('startsOn', v)} />
                        <FormField label="Starts (HH:MM)" value={draft.startTime} onChangeText={(v) => vm.setDraftField('startTime', v)} />
                        <FormField label="Ends (HH:MM)" value={draft.endTime} onChangeText={(v) => vm.setDraftField('endTime', v)} />
                      </>
                    ) : action.type !== 'create_goal' ? (
                      <DateField label="Due date (optional)" value={draft.dueOn} onChangeText={(v) => vm.setDraftField('dueOn', v)} />
                    ) : null}
                    {action.type === 'create_task' || action.type === 'update_task' ? (
                      <SelectField label="Priority" value={draft.priority} options={vm.priorityOptions} onChange={(v) => vm.setDraftField('priority', v)} />
                    ) : null}
                  </FieldGrid>
                  <Row wrap>
                    <Button compact mode="contained" onPress={vm.saveEdit} disabled={vm.busy}>
                      Accept with changes
                    </Button>
                    <Button compact onPress={vm.cancelEdit}>
                      Cancel
                    </Button>
                  </Row>
                </View>
              ) : action.open && action.canDecide ? (
                <Row wrap>
                  <Button compact mode="contained" onPress={() => vm.accept(action.id)} disabled={vm.busy}>
                    Accept
                  </Button>
                  <Button compact mode="outlined" onPress={() => vm.startEdit(action.id)} disabled={vm.busy}>
                    Edit first
                  </Button>
                  <Button compact onPress={() => vm.dismiss(action.id)} disabled={vm.busy}>
                    Dismiss
                  </Button>
                </Row>
              ) : action.open ? (
                <Text style={partStyles.muted}>Someone who manages goals can accept this.</Text>
              ) : action.createdTaskId ? (
                <Button compact icon="arrow-right" onPress={() => onOpenTask(action.createdTaskId ?? '')}>
                  Open the task
                </Button>
              ) : action.createdEventId ? (
                <Button compact icon="arrow-right" onPress={() => onOpenEvent(action.createdEventId ?? '')}>
                  Open the event
                </Button>
              ) : action.createdGoalId && action.status !== 'dismissed' ? (
                <Button compact icon="arrow-right" onPress={() => onOpenGoal(action.createdGoalId ?? '')}>
                  Open the goal
                </Button>
              ) : null}
            </View>
          </View>
        ))}
      </Panel>

      {vm.sources.length > 0 ? (
        <Panel style={styles.panel}>
          <SectionHeader title="Based on" />
          {vm.sources.map((source) => (
            <List.Item
              key={`${source.type}-${source.ref}`}
              title={source.label}
              description={source.type === 'kpi' ? 'Measure' : source.type === 'goal' ? 'Goal' : source.type === 'task' ? 'Task' : 'Event'}
              onPress={source.type === 'goal' ? () => onOpenGoal(source.ref) : source.type === 'task' ? () => onOpenTask(source.ref) : undefined}
            />
          ))}
        </Panel>
      ) : null}

      <Row wrap>
        <Button mode="outlined" icon="creation-outline" onPress={() => onAskVerida(vm.askQuestion)}>
          Ask Verida about this
        </Button>
        {vm.canRegenerate ? (
          <Button mode="outlined" icon="refresh" onPress={vm.regenerate} loading={vm.regenerating} disabled={vm.regenerating}>
            Ask again
          </Button>
        ) : null}
        {vm.canDismissAll ? (
          <Button onPress={vm.dismissAll} textColor={supporting.error}>
            Dismiss all
          </Button>
        ) : null}
      </Row>
    </Screen>
  );
}

// ---------------------------------------------------------------------------------------------
// Sections 3 and 13: Plan settings.

export function PlanSettingsScreen({ onDone }: { onDone: () => void }) {
  const vm = usePlanSettingsViewModel({ onDone });
  if (vm.error) return <ErrorView message={vm.error} />;
  if (vm.loading || !vm.settings) return <LoadingView />;
  const s = vm.settings;
  return (
    <Screen variant="form">
      {!vm.canEdit ? <Notice tone="info">Only the owner can change these settings.</Notice> : null}
      <Panel>
        <List.Item
          title="Team members can be given tasks"
          description="Turn off to give tasks to owners only."
          descriptionNumberOfLines={3}
          right={() => <Switch value={s.allowStaffAssignment} disabled={!vm.canEdit} onValueChange={(value) => vm.set('allowStaffAssignment', value)} />}
        />
        <List.Item
          title="Suggestions every Monday"
          description="Verida’s built-in rules look at overdue and blocked work and goals with nothing moving them, every Monday morning. AI suggestions are always on request."
          descriptionNumberOfLines={4}
          right={() => <Switch value={s.weeklySuggestions} disabled={!vm.canEdit} onValueChange={(value) => vm.set('weeklySuggestions', value)} />}
        />
        <View style={styles.inset}>
          <SelectField label="Time for reminders on the due day" value={s.defaultReminderTime} options={vm.reminderTimes} onChange={(value) => vm.set('defaultReminderTime', value)} disabled={!vm.canEdit} />
        </View>
      </Panel>
      {vm.canEdit ? (
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          Save settings
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { padding: spacing.xs, gap: 0 },
  inset: { padding: spacing.sm, gap: spacing.xs },
  edit: { gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.softMint },
  grow: { flex: 1, minWidth: 0 },
});
