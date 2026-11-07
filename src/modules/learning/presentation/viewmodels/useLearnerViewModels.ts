import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { LearnerProfile, LearnerProfileStatus, LessonCompletion, LessonStatus } from '../../domain/models';
import { completionSchema, learnerProfileSchema } from '../../domain/validation';
import { useLearningDependencies } from '../di';

const WEEKLY_STATUS: Record<LessonStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  pending_review: { label: 'Awaiting review', tone: 'warn' },
  changes_requested: { label: 'Being improved', tone: 'warn' },
  rejected: { label: 'Not published', tone: 'neutral' },
  published: { label: 'Ready to start', tone: 'ok' },
  completed: { label: 'Completed', tone: 'ok' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export function useLearnViewModel() {
  const { lessons, reviews } = useLearningDependencies();
  const { business } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const scope = [...businessScope(business.id), 'learning'];

  const state = useQuery({
    queryKey: [...scope, 'weekly-state'],
    queryFn: () => lessons.weeklyState(business.id),
  });
  const list = useQuery({
    queryKey: [...scope, 'mine'],
    queryFn: () => lessons.listMine(business.id),
  });
  const canReview = useQuery({
    queryKey: ['learning', 'can-review'],
    queryFn: () => reviews.canReview(),
    staleTime: Infinity,
  });

  const request = useMutation({
    mutationFn: () => lessons.requestWeeklyLesson(business.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Your lesson has been prepared and sent for review.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const lessonList = list.data ?? [];
  const completed = lessonList.filter((lesson) => lesson.status === 'completed').length;
  const weekly = state.data ? WEEKLY_STATUS[state.data.status] : null;

  return {
    loading: state.isPending || list.isPending,
    error: state.error || list.error ? errorMessage(state.error ?? list.error) : null,
    refreshing: list.isRefetching,
    refresh: () => void queryClient.invalidateQueries({ queryKey: scope }),
    weekly,
    // A lesson's content is only visible once it has been reviewed and published.
    isAwaitingReview: state.data?.status === 'pending_review' || state.data?.status === 'changes_requested',
    canRequest: !state.data || state.data.status === 'rejected' || state.data.status === 'completed',
    requesting: request.isPending,
    requestLesson: () => request.mutate(),
    lessons: lessonList,
    progress: { completed, total: lessonList.length },
    canReview: canReview.data ?? false,
  };
}

export function useLessonViewModel({ lessonId, onDone }: { lessonId: string; onDone: () => void }) {
  const { lessons } = useLearningDependencies();
  const { business } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const scope = [...businessScope(business.id), 'learning'];
  const form = useForm(completionSchema, { answer: '', rating: '', feedback: '' });

  const lesson = useQuery({
    queryKey: [...scope, 'lesson', lessonId],
    queryFn: () => lessons.get(lessonId),
  });
  const response = useQuery({
    queryKey: [...scope, 'response', lessonId],
    queryFn: () => lessons.getResponse(lessonId),
    enabled: lesson.data?.status === 'completed',
  });
  const { reset } = form;

  const activities = useQuery({
    queryKey: [...scope, 'activities', lessonId],
    queryFn: () => lessons.listActivities(lessonId),
    enabled: Boolean(lesson.data),
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!response.data) return;
    reset({
      answer: response.data.answer ?? '',
      rating: response.data.rating === null ? '' : String(response.data.rating),
      feedback: response.data.feedback ?? '',
    });
  }, [response.data, reset]);

  // Section 5: a learner may correct what they submitted.
  const correct = useMutation({
    mutationFn: (input: LessonCompletion) => lessons.correctResponse(lessonId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Your response has been updated.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  // FR-F35, FR-F36, FR-F40.
  const saveActivity = useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) => lessons.submitActivity(id, answer),
    onSuccess: async (_result, { id }) => {
      await queryClient.invalidateQueries({ queryKey: [...scope, 'activities', lessonId] });
      setDrafts(({ [id]: _saved, ...others }) => others);
      feedback.success('Your answer has been saved.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  // Section 5: what they wrote goes, while the record that they finished the lesson stays.
  const deleteResponse = useMutation({
    mutationFn: () => lessons.deleteResponse(lessonId),
    onSuccess: async () => {
      setConfirmingDelete(false);
      setDrafts({});
      reset({ answer: '', rating: '', feedback: '' });
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Your response has been deleted.');
    },
    onError: (error) => {
      setConfirmingDelete(false);
      feedback.error(errorMessage(error));
    },
  });

  const complete = useMutation({
    mutationFn: (completion: LessonCompletion) => lessons.complete(lessonId, completion),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Lesson completed. Well done.');
      onDone();
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const activityList = activities.data ?? [];
  const answered = activityList.filter((activity) => activity.answer !== null).length;
  const isCompleted = lesson.data?.status === 'completed';

  return {
    loading: lesson.isPending,
    error: lesson.error ? errorMessage(lesson.error) : null,
    lesson: lesson.data ?? null,
    isCompleted,
    activities: activityList.map((activity) => ({
      id: activity.id,
      prompt: activity.prompt,
      value: drafts[activity.id] ?? activity.answer ?? '',
      isAnswered: activity.answer !== null,
    })),
    activityProgress: `${answered} of ${activityList.length} answered`,
    setActivityAnswer: (id: string, value: string) => setDrafts((current) => ({ ...current, [id]: value })),
    saveActivityAnswer(id: string) {
      const answer = (drafts[id] ?? activityList.find((activity) => activity.id === id)?.answer ?? '').trim();
      if (answer) saveActivity.mutate({ id, answer });
      else feedback.error('Write your answer first.');
    },
    savingActivity: saveActivity.isPending,
    // Once deleted there is nothing left to correct, so the form is not offered again.
    showResponseForm: !isCompleted || response.isPending || response.data !== null,
    canDeleteResponse: Boolean(response.data) || answered > 0,
    confirmingDelete,
    askToDeleteResponse: () => setConfirmingDelete(true),
    cancelDeleteResponse: () => setConfirmingDelete(false),
    confirmDeleteResponse: () => deleteResponse.mutate(),
    deletingResponse: deleteResponse.isPending,
    form,
    completing: complete.isPending || correct.isPending,
    submit() {
      const input = form.validate();
      if (!input) return;
      if (lesson.data?.status === 'completed') correct.mutate(input);
      else complete.mutate(input);
    },
  };
}

const PROFILE_STATUS_LABEL = { active: 'Active', deactivated: 'Deactivated', deletion_requested: 'Deletion requested' } as const;

export function useLearnerProfileViewModel({ onDone }: { onDone: () => void }) {
  const { learnerProfiles, currentUserId } = useLearningDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const queryKey = ['learning', 'learner-profile'];
  const form = useForm(learnerProfileSchema, { goals: '', topics: '', preferredFormat: 'reading' });
  const { reset } = form;

  const profile = useQuery({
    queryKey,
    queryFn: async () => learnerProfiles.get(await currentUserId()),
  });

  useEffect(() => {
    if (!profile.data) return;
    reset({
      goals: profile.data.goals.join(', '),
      topics: profile.data.topics.join(', '),
      preferredFormat: profile.data.preferredFormat,
    });
  }, [profile.data, reset]);

  const save = useMutation({
    mutationFn: async (input: LearnerProfile) => learnerProfiles.save(await currentUserId(), input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      feedback.success('Your learning preferences have been saved.');
      onDone();
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });
  const setStatus = useMutation({
    mutationFn: (status: LearnerProfileStatus) => learnerProfiles.setStatus(status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      feedback.success('Your learning profile has been updated.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const status = profile.data?.status ?? 'active';

  return {
    loading: profile.isPending,
    error: profile.error ? errorMessage(profile.error) : null,
    form,
    statusLabel: PROFILE_STATUS_LABEL[status],
    isActive: status === 'active',
    deactivate: () => setStatus.mutate('deactivated'),
    reactivate: () => setStatus.mutate('active'),
    requestDeletion: () => setStatus.mutate('deletion_requested'),
    saving: save.isPending || setStatus.isPending,
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}
