import { StyleSheet, View } from 'react-native';
import { Divider, List, Text } from 'react-native-paper';

import { Button, ConfirmDialog, EmptyState, ErrorView, FormField, Kicker, LoadingView, Notice, Panel, Row, Screen, SectionHeader, SelectField, StatusPill, palette, radius, spacing, supporting, HeroCard, GrowBar, IconTile } from '@/design-system';

import { FORMAT_OPTIONS } from '../../domain/validation';
import { useLearnerProfileViewModel, useLearnViewModel, useLessonViewModel } from '../viewmodels/useLearnerViewModels';

type LearnScreenProps = {
  onOpenLesson: (id: string) => void;
  onOpenPreferences: () => void;
  onOpenReview: () => void;
};

export function LearnScreen({ onOpenLesson, onOpenPreferences, onOpenReview }: LearnScreenProps) {
  const vm = useLearnViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.refresh} />;

  return (
    <Screen refreshing={vm.refreshing} onRefresh={vm.refresh}>
      <HeroCard kicker="Verida Learn" title="A lesson a week, shaped around your business." body="A learning journey that grows with you." />

      <Panel>
        <SectionHeader
          title="This week's lesson"
          description="Personalised from your business context and learning goals"
          action={vm.weekly ? <StatusPill label={vm.weekly.label} tone={vm.weekly.tone} /> : undefined}
        />
        {vm.isAwaitingReview ? <Notice>Weekly lessons are reviewed by the Verida learning team before they are published. We will notify you when yours is ready.</Notice> : null}
        {vm.canRequest ? (
          <Button mode="contained" onPress={vm.requestLesson} loading={vm.requesting} disabled={vm.requesting}>
            Prepare my lesson
          </Button>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeader title="Your learning journey" description={`${vm.progress.completed} of ${vm.progress.total} lessons completed`} />
        {vm.progress.total > 0 ? (
          <View style={styles.progress}>
            <GrowBar ratio={vm.progress.completed / vm.progress.total} />
          </View>
        ) : null}
        {vm.lessons.length === 0 ? (
          <EmptyState illustration="book" title="Your published lessons will appear here." />
        ) : (
          vm.lessons.map((lesson, index) => (
            <View key={lesson.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={lesson.title}
                description={lesson.objective}
                onPress={() => onOpenLesson(lesson.id)}
                left={() => <IconTile icon={lesson.status === 'completed' ? 'check' : 'book-open-page-variant-outline'} tone={lesson.status === 'completed' ? 'mint' : 'coral'} />}
                right={() => <StatusPill label={lesson.status === 'completed' ? 'Completed' : 'Start'} tone={lesson.status === 'completed' ? 'ok' : 'warn'} />}
              />
            </View>
          ))
        )}
      </Panel>

      <Panel>
        <SectionHeader title="How lessons are personalised" />
        <Text variant="bodySmall" style={styles.muted}>
          Verida considers your business type, goals and previous learning, and adapts reviewed learning content to your situation.
        </Text>
        <Row wrap>
          <Button mode="outlined" onPress={onOpenPreferences}>
            My learning preferences
          </Button>
          {vm.canReview ? (
            <Button mode="contained-tonal" icon="check-decagram-outline" onPress={onOpenReview}>
              Review centre
            </Button>
          ) : null}
        </Row>
      </Panel>
    </Screen>
  );
}

export function LessonScreen({ lessonId, onDone }: { lessonId: string; onDone: () => void }) {
  const vm = useLessonViewModel({ lessonId, onDone });

  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.lesson) return <ErrorView message={vm.error ?? 'This lesson is not available.'} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      <View style={styles.lesson}>
        <Kicker>Weekly lesson</Kicker>
        <Text variant="headlineSmall" style={styles.title}>
          {vm.lesson.title}
        </Text>
        <Text variant="bodyMedium">{vm.lesson.intro}</Text>
        <View style={styles.example}>
          <Text variant="bodySmall">{vm.lesson.example}</Text>
        </View>
        <Text variant="titleSmall">Practical activity</Text>
        <Text variant="bodyMedium">{vm.lesson.challenge}</Text>
      </View>

      {vm.activities.length > 0 ? (
        <Panel>
          <SectionHeader title="Lesson activities" description={vm.activityProgress} />
          {vm.activities.map((activity, index) => (
            <View key={activity.id} style={styles.activity}>
              {index > 0 ? <Divider /> : null}
              <Text variant="bodyMedium">{activity.prompt}</Text>
              <FormField label="Your answer" value={activity.value} onChangeText={(v) => vm.setActivityAnswer(activity.id, v)} multiline />
              <Button mode="outlined" onPress={() => vm.saveActivityAnswer(activity.id)} disabled={vm.savingActivity}>
                {activity.isAnswered ? 'Update answer' : 'Save answer'}
              </Button>
            </View>
          ))}
        </Panel>
      ) : null}

      {vm.showResponseForm ? (
        <>
          {vm.isCompleted ? <Notice>You have completed this lesson. You can still correct your response below.</Notice> : null}
          <Panel>
            <SectionHeader title={vm.isCompleted ? 'Your response' : 'Finish this lesson'} description="Your response helps Verida shape future lessons." />
            <FormField label="What did you find or do? (optional)" value={values.answer} onChangeText={(v) => setValue('answer', v)} error={errors.answer} multiline />
            <SelectField label="How useful was it? (optional)" value={values.rating} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} of 5` }))} onChange={(v) => setValue('rating', v)} error={errors.rating} />
            <FormField label="Feedback (optional)" value={values.feedback} onChangeText={(v) => setValue('feedback', v)} error={errors.feedback} multiline />
            <Button mode="contained" onPress={vm.submit} loading={vm.completing} disabled={vm.completing}>
              {vm.isCompleted ? 'Save correction' : 'Mark as completed'}
            </Button>
          </Panel>
        </>
      ) : (
        <Notice>You have completed this lesson and deleted your response.</Notice>
      )}

      {vm.canDeleteResponse ? (
        <Button onPress={vm.askToDeleteResponse} disabled={vm.deletingResponse} textColor={supporting.error}>
          Delete my response
        </Button>
      ) : null}
      <ConfirmDialog
        visible={vm.confirmingDelete}
        title="Delete your response?"
        message="Your answers, rating and feedback for this lesson are deleted for good. Verida keeps only the fact that you finished it."
        confirmLabel="Delete"
        destructive
        busy={vm.deletingResponse}
        onDismiss={vm.cancelDeleteResponse}
        onConfirm={vm.confirmDeleteResponse}
      />
    </Screen>
  );
}

export function LearnerProfileScreen({ onDone }: { onDone: () => void }) {
  const vm = useLearnerProfileViewModel({ onDone });

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      <Panel>
        <SectionHeader title="My learning preferences" description="Separate several items with commas." />
        <FormField label="Learning goals" value={values.goals} onChangeText={(v) => setValue('goals', v)} error={errors.goals} placeholder="e.g. Understand my costs" />
        <FormField label="Topics I want to learn" value={values.topics} onChangeText={(v) => setValue('topics', v)} error={errors.topics} placeholder="e.g. Profit, stock control" />
        <SelectField label="Preferred format" value={values.preferredFormat} options={FORMAT_OPTIONS} onChange={(v) => setValue('preferredFormat', v)} error={errors.preferredFormat} />
        <Button mode="contained" onPress={vm.submit} loading={vm.saving} disabled={vm.saving}>
          Save preferences
        </Button>
      </Panel>
      <Panel>
        <SectionHeader title="Learning profile" action={<StatusPill label={vm.statusLabel} tone={vm.isActive ? 'ok' : 'warn'} />} />
        <Row wrap>
          {vm.isActive ? (
            <Button onPress={vm.deactivate} disabled={vm.saving}>
              Deactivate
            </Button>
          ) : (
            <Button onPress={vm.reactivate} disabled={vm.saving}>
              Reactivate
            </Button>
          )}
          <Button onPress={vm.requestDeletion} disabled={vm.saving} textColor={supporting.error}>
            Request deletion
          </Button>
        </Row>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: supporting.mutedText },
  progress: { flexDirection: 'row' },
  activity: { gap: spacing.sm },
  lesson: {
    backgroundColor: supporting.mintWash,
    borderWidth: 1,
    borderColor: supporting.mintBorder,
    borderRadius: radius.lg,
    padding: spacing.lg + spacing.xs,
    gap: spacing.md,
  },
  title: { color: palette.deepTeal },
  example: { backgroundColor: supporting.white, borderLeftWidth: 3, borderLeftColor: palette.teal, padding: spacing.md, borderRadius: spacing.xs },
});
