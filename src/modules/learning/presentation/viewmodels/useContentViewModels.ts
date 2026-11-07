import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';

import type { ContentStatus, LearnerWorkspace, LearningContentInput } from '../../domain/models';
import { assignEmailSchema, contentFormSchema } from '../../domain/validation';
import { useLearningDependencies } from '../di';

const scope = ['learning', 'content'];

export function useContentListViewModel() {
  const { content } = useLearningDependencies();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const list = useQuery({
    queryKey: [...scope, 'list', { search, status }],
    queryFn: () => content.list({ search, status: (status || undefined) as ContentStatus | undefined }),
  });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    items: list.data ?? [],
    search,
    setSearch,
    status,
    setStatus,
  };
}

const EMPTY = {
  industryCode: '',
  topic: '',
  difficulty: 'beginner',
  objective: '',
  kpiCode: '',
  title: '',
  intro: '',
  example: '',
  challenge: '',
  activities: '',
  approvalStatus: 'draft',
};

export function useContentFormViewModel({ contentId, onDone }: { contentId?: string; onDone: () => void }) {
  const { content } = useLearningDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(contentFormSchema, EMPTY);
  const { reset } = form;

  const existing = useQuery({
    queryKey: [...scope, 'detail', contentId],
    queryFn: () => content.get(contentId ?? ''),
    enabled: Boolean(contentId),
  });
  const industries = useQuery({ queryKey: [...scope, 'industries'], queryFn: () => content.industryOptions() });
  const kpis = useQuery({ queryKey: [...scope, 'kpis'], queryFn: () => content.kpiOptions() });

  useEffect(() => {
    if (!existing.data) return;
    const item = existing.data;
    reset({
      industryCode: item.industryCode ?? '',
      topic: item.topic,
      difficulty: item.difficulty,
      objective: item.objective,
      kpiCode: item.kpiCode ?? '',
      title: item.title,
      intro: item.intro,
      example: item.example,
      challenge: item.challenge,
      activities: item.activities.join('\n'),
      approvalStatus: item.approvalStatus,
    });
  }, [existing.data, reset]);

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: scope });
    feedback.success(message);
    onDone();
  };
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: (input: LearningContentInput) => (contentId ? content.update(contentId, input) : content.create(input)),
    onSuccess: () => finish('Learning content saved.'),
    ...report,
  });

  return {
    isEditing: Boolean(contentId),
    loading: Boolean(contentId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    version: existing.data?.version ?? null,
    form,
    industryOptions: [{ value: '', label: 'All industries' }, ...(industries.data ?? [])],
    kpiOptions: [{ value: '', label: 'No linked measure' }, ...(kpis.data ?? [])],
    busy: save.isPending,
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}

export function useContentDetailViewModel(contentId: string) {
  const { content } = useLearningDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();

  const detail = useQuery({ queryKey: [...scope, 'detail', contentId], queryFn: () => content.get(contentId) });
  const industries = useQuery({ queryKey: [...scope, 'industries'], queryFn: () => content.industryOptions() });
  const kpis = useQuery({ queryKey: [...scope, 'kpis'], queryFn: () => content.kpiOptions() });
  const archive = useMutation({
    mutationFn: () => content.setStatus(contentId, 'archived'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success('Learning content archived.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const item = detail.data ?? null;
  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    item,
    industryName: item?.industryCode ? (industries.data?.find((option) => option.value === item.industryCode)?.label ?? item.industryCode) : 'All industries',
    kpiName: item?.kpiCode ? (kpis.data?.find((option) => option.value === item.kpiCode)?.label ?? item.kpiCode) : null,
    canArchive: item !== null && item.approvalStatus !== 'archived',
    canAssign: item?.approvalStatus === 'approved',
    archiving: archive.isPending,
    archive: () => archive.mutate(),
  };
}

// Section 5, Lesson "Assign". The result still goes through review before the learner sees it.
export function useAssignLessonViewModel(contentId: string) {
  const { content } = useLearningDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);

  const find = useMutation({
    mutationFn: (address: string) => content.learnerWorkspaces(address),
    onError: (error) => feedback.error(errorMessage(error)),
  });
  const assign = useMutation({
    mutationFn: ({ userId, businessId }: LearnerWorkspace) => content.assign(contentId, userId, businessId),
    onSuccess: async () => {
      setEmail('');
      find.reset();
      await queryClient.invalidateQueries({ queryKey: ['learning'] });
      feedback.success('Lesson assigned. It is now waiting for review.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    email,
    setEmail(value: string) {
      setEmail(value);
      setEmailError(undefined);
      find.reset();
    },
    emailError,
    search() {
      const parsed = assignEmailSchema.safeParse(email);
      if (parsed.success) find.mutate(parsed.data);
      else setEmailError(parsed.error.issues[0]?.message);
    },
    searched: find.isSuccess,
    workspaces: find.data ?? [],
    busy: find.isPending || assign.isPending,
    assign: (workspace: LearnerWorkspace) => assign.mutate(workspace),
  };
}
