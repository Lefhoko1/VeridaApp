import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';

import type { LessonContent, LessonStatus, ReviewDecision } from '../../domain/models';
import { lessonContentSchema, parseLines } from '../../domain/validation';
import { useLearningDependencies } from '../di';

const scope = ['learning', 'review'];

export const REVIEW_FILTERS = [
  { value: 'pending_review', label: 'Pending' },
  { value: 'changes_requested', label: 'Changes' },
  { value: 'published', label: 'Published' },
  { value: 'completed', label: 'Done' },
  { value: 'rejected', label: 'Rejected' },
];

export function useReviewCentreViewModel() {
  const { reviews } = useLearningDependencies();
  const [status, setStatus] = useState<LessonStatus>('pending_review');
  const [search, setSearch] = useState('');

  const list = useQuery({
    queryKey: [...scope, 'list', { status, search }],
    queryFn: () => reviews.list({ status, search }),
  });
  const pending = useQuery({
    queryKey: [...scope, 'count', 'pending_review'],
    queryFn: async () => (await reviews.list({ status: 'pending_review' })).length,
  });
  const published = useQuery({
    queryKey: [...scope, 'count', 'published'],
    queryFn: async () => (await reviews.list({ status: 'published' })).length,
  });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    items: list.data ?? [],
    status,
    setStatus,
    search,
    setSearch,
    pendingCount: pending.data ?? 0,
    publishedCount: published.data ?? 0,
  };
}

export function useReviewLessonViewModel({ lessonId, onDone }: { lessonId: string; onDone: () => void }) {
  const { reviews } = useLearningDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(lessonContentSchema, { title: '', intro: '', example: '', challenge: '' });
  const { reset } = form;
  const [comments, setComments] = useState('');
  // What the reviewer has typed, until saved. Otherwise the field shows the saved activities.
  const [activityDraft, setActivityDraft] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const lesson = useQuery({
    queryKey: [...scope, 'detail', lessonId],
    queryFn: () => reviews.get(lessonId),
  });
  const activities = useQuery({
    queryKey: [...scope, 'activities', lessonId],
    queryFn: () => reviews.listActivities(lessonId),
  });
  const response = useQuery({
    queryKey: [...scope, 'response', lessonId],
    queryFn: () => reviews.getResponse(lessonId),
  });

  useEffect(() => {
    if (!lesson.data) return;
    const { title, intro, example, challenge } = lesson.data;
    reset({ title, intro, example, challenge });
  }, [lesson.data, reset]);

  const source = useQuery({
    queryKey: [...scope, 'source', lesson.data?.contentId],
    queryFn: () => reviews.getSource(lesson.data?.contentId ?? ''),
    enabled: Boolean(lesson.data?.contentId),
  });

  const activityText = activityDraft ?? (activities.data ?? []).map((activity) => activity.prompt).join('\n');

  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  // FR-F29.
  const regenerate = useMutation({
    mutationFn: () => reviews.regenerate(lessonId, comments.trim() || null),
    onSuccess: async () => {
      setComments('');
      setActivityDraft(null);
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('A new draft has been prepared for your review.');
    },
    ...report,
  });
  const archive = useMutation({
    mutationFn: () => reviews.archive(lessonId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Lesson archived.');
      onDone();
    },
    ...report,
  });

  const saveEdits = useMutation({
    mutationFn: async (content: LessonContent) => {
      await reviews.edit(lessonId, content);
      await reviews.setActivities(lessonId, parseLines(activityText));
    },
    onSuccess: async () => {
      setActivityDraft(null);
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Your edits have been saved.');
    },
    ...report,
  });
  const decide = useMutation({
    mutationFn: async ({ decision, content }: { decision: ReviewDecision; content: LessonContent }) => {
      // Approval publishes what is on screen, so unsaved edits go in first.
      if (decision === 'approve') {
        await reviews.edit(lessonId, content);
        await reviews.setActivities(lessonId, parseLines(activityText));
      }
      await reviews.decide(lessonId, decision, comments.trim() || null);
    },
    onSuccess: async (_result, { decision }) => {
      await queryClient.invalidateQueries({ queryKey: scope });
      const messages: Record<ReviewDecision, string> = {
        approve: 'Lesson approved and published.',
        reject: 'Lesson rejected.',
        request_changes: 'Changes requested.',
      };
      feedback.success(messages[decision]);
      onDone();
    },
    ...report,
  });

  // Section 5: Verida staff can remove a response, for example when a learner asks them to.
  const deleteResponse = useMutation({
    mutationFn: () => reviews.deleteResponse(lessonId),
    onSuccess: async () => {
      setConfirmingDelete(false);
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('The response has been deleted.');
    },
    onError: (error: unknown) => {
      setConfirmingDelete(false);
      feedback.error(errorMessage(error));
    },
  });

  const status = lesson.data?.status;
  const isOpen = status === 'pending_review' || status === 'changes_requested';

  const submitDecision = (decision: ReviewDecision) => {
    const content = form.validate();
    if (content) decide.mutate({ decision, content });
  };

  return {
    loading: lesson.isPending,
    error: lesson.error ? errorMessage(lesson.error) : null,
    objective: lesson.data?.objective ?? '',
    learnerContext: lesson.data?.businessContext ?? '',
    source: lesson.data?.generatedBy === 'ai' ? 'AI generated from approved content' : 'Adapted from approved learning content',
    // FR-F25: the approved material this draft is based on.
    sourceMaterial: source.data ? `${source.data.title} (${source.data.topic}, version ${source.data.version})` : '',
    status,
    isOpen,
    canArchive: status === 'published' || status === 'completed' || status === 'rejected',
    archive: () => archive.mutate(),
    regenerate: () => regenerate.mutate(),
    form,
    comments,
    setComments,
    busy: saveEdits.isPending || decide.isPending || regenerate.isPending || archive.isPending || deleteResponse.isPending,
    activityText,
    setActivityText: setActivityDraft,
    learnerResponse: response.data ?? null,
    learnerAnswers: (activities.data ?? []).filter((activity) => activity.answer !== null),
    canDeleteResponse: Boolean(response.data) || (activities.data ?? []).some((activity) => activity.answer !== null),
    confirmingDelete,
    askToDeleteResponse: () => setConfirmingDelete(true),
    cancelDeleteResponse: () => setConfirmingDelete(false),
    confirmDeleteResponse: () => deleteResponse.mutate(),
    saveEdits() {
      const content = form.validate();
      if (content) saveEdits.mutate(content);
    },
    approve: () => submitDecision('approve'),
    reject: () => submitDecision('reject'),
    requestChanges: () => submitDecision('request_changes'),
  };
}
