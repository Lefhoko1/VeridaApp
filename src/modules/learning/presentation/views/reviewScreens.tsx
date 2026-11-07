import { View } from 'react-native';
import { Divider, List, Searchbar, SegmentedButtons, Text } from 'react-native-paper';

import { Button, ConfirmDialog, EmptyState, ErrorView, FormField, LabelValue, LoadingView, MetricCard, MetricGrid, Notice, Panel, Row, Screen, SectionHeader, StatusPill, spacing, supporting } from '@/design-system';

import type { LessonStatus } from '../../domain/models';
import { REVIEW_FILTERS, useReviewCentreViewModel, useReviewLessonViewModel } from '../viewmodels/useReviewViewModels';

// A reviewer must be able to read a lesson in full without scrolling inside each field.
const LESSON_FIELD_LINES = 6;

export function ReviewCentreScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const vm = useReviewCentreViewModel();

  return (
    <Screen>
      <SectionHeader title="Learning review centre" description="Review personalised weekly lessons before owners receive them." />
      <MetricGrid>
        <MetricCard label="Pending review" value={String(vm.pendingCount)} caption="Draft lessons" />
        <MetricCard label="Published" value={String(vm.publishedCount)} caption="Ready for learners" />
      </MetricGrid>
      <SegmentedButtons value={vm.status} onValueChange={(value) => vm.setStatus(value as LessonStatus)} buttons={REVIEW_FILTERS} />
      <Searchbar placeholder="Search by title" value={vm.search} onChangeText={vm.setSearch} style={{ backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line }} />
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="done" title="Nothing here right now." />
      ) : (
        <Panel style={{ padding: spacing.xs, gap: 0 }}>
          {vm.items.map((lesson, index) => (
            <View key={lesson.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item title={lesson.title} description={lesson.businessContext} onPress={() => onOpen(lesson.id)} right={(props) => <List.Icon {...props} icon="chevron-right" />} />
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

export function ReviewLessonScreen({ lessonId, onDone }: { lessonId: string; onDone: () => void }) {
  const vm = useReviewLessonViewModel({ lessonId, onDone });

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} />;
  const { values, errors, setValue } = vm.form;
  const disabled = !vm.isOpen;

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Lesson details" action={vm.isOpen ? <StatusPill label="Pending review" tone="warn" /> : <StatusPill label="Decided" tone="neutral" />} />
        <LabelValue label="Prepared for" value={vm.learnerContext} />
        <LabelValue label="Learning objective" value={vm.objective} />
        <LabelValue label="Source" value={vm.source} />
        {vm.sourceMaterial ? <LabelValue label="Based on" value={vm.sourceMaterial} /> : null}
      </Panel>

      <Panel>
        <SectionHeader title="Lesson preview" description="Edit anything that needs correcting before you approve." />
        <FormField label="Title" value={values.title} onChangeText={(v) => setValue('title', v)} error={errors.title} disabled={disabled} />
        <FormField label="Introduction" value={values.intro} onChangeText={(v) => setValue('intro', v)} error={errors.intro} multiline numberOfLines={LESSON_FIELD_LINES} disabled={disabled} />
        <FormField label="Example" value={values.example} onChangeText={(v) => setValue('example', v)} error={errors.example} multiline numberOfLines={LESSON_FIELD_LINES} disabled={disabled} />
        <FormField label="Practical activity" value={values.challenge} onChangeText={(v) => setValue('challenge', v)} error={errors.challenge} multiline numberOfLines={LESSON_FIELD_LINES} disabled={disabled} />
        <FormField label="Further activities, one per line (optional)" value={vm.activityText} onChangeText={vm.setActivityText} multiline numberOfLines={LESSON_FIELD_LINES} disabled={disabled} />
        {vm.isOpen ? (
          <Button mode="outlined" onPress={vm.saveEdits} disabled={vm.busy}>
            Save edits
          </Button>
        ) : null}
      </Panel>

      {vm.isOpen ? (
        <Panel>
          <SectionHeader title="Your decision" />
          <FormField label="Review comments (optional)" value={vm.comments} onChangeText={vm.setComments} multiline />
          <Notice>Human approval is required before a lesson is published to its learner.</Notice>
          <Button mode="contained" onPress={vm.approve} loading={vm.busy} disabled={vm.busy}>
            Approve and publish
          </Button>
          <Row wrap>
            <Button onPress={vm.requestChanges} disabled={vm.busy}>
              Request changes
            </Button>
            <Button onPress={vm.regenerate} disabled={vm.busy}>
              Regenerate
            </Button>
            <Button onPress={vm.reject} disabled={vm.busy} textColor={supporting.error}>
              Reject
            </Button>
          </Row>
        </Panel>
      ) : (
        <Text variant="bodySmall">This lesson has already been decided, so it can no longer be changed.</Text>
      )}
      {vm.canDeleteResponse ? (
        <Panel>
          <SectionHeader title="Learner's response" />
          {vm.learnerResponse?.answer ? <LabelValue label="Answer" value={vm.learnerResponse.answer} /> : null}
          {vm.learnerResponse?.rating ? <LabelValue label="Rating" value={`${vm.learnerResponse.rating} of 5`} /> : null}
          {vm.learnerResponse?.feedback ? <LabelValue label="Feedback" value={vm.learnerResponse.feedback} /> : null}
          {vm.learnerAnswers.map((activity) => (
            <LabelValue key={activity.id} label={activity.prompt} value={activity.answer ?? ''} />
          ))}
          <Button onPress={vm.askToDeleteResponse} disabled={vm.busy} textColor={supporting.error}>
            Delete this response
          </Button>
        </Panel>
      ) : null}
      <ConfirmDialog
        visible={vm.confirmingDelete}
        title="Delete this response?"
        message="The learner's answers, rating and feedback are deleted for good. The audit log records only that you deleted them."
        confirmLabel="Delete"
        destructive
        busy={vm.busy}
        onDismiss={vm.cancelDeleteResponse}
        onConfirm={vm.confirmDeleteResponse}
      />
      {vm.canArchive ? (
        <Button onPress={vm.archive} disabled={vm.busy}>
          Archive this lesson
        </Button>
      ) : null}
    </Screen>
  );
}
