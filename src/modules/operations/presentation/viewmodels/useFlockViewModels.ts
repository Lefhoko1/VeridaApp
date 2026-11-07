import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { FlockInput } from '../../domain/models';
import { flockFormSchema } from '../../domain/validation';
import { useOperationsDependencies } from '../di';

export function useFlockListViewModel() {
  const { flocks } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const list = useQuery({
    queryKey: [...businessScope(business.id), 'flocks'],
    queryFn: () => flocks.list(business.id),
  });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    items: list.data ?? [],
    canCreate: can('records.create'),
  };
}

export function useFlockFormViewModel({ flockId, onDone }: { flockId?: string; onDone: () => void }) {
  const { flocks } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(flockFormSchema, { name: '', breed: '', acquiredOn: '', initialCount: '' });
  const { reset } = form;

  const existing = useQuery({
    queryKey: [...businessScope(business.id), 'flocks', 'detail', flockId],
    queryFn: () => flocks.get(flockId ?? ''),
    enabled: Boolean(flockId),
  });

  useEffect(() => {
    if (!existing.data) return;
    const flock = existing.data;
    reset({
      name: flock.name,
      breed: flock.breed ?? '',
      acquiredOn: flock.acquiredOn ?? '',
      initialCount: flock.initialCount === null ? '' : String(flock.initialCount),
    });
  }, [existing.data, reset]);

  const finish = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
    feedback.success(message);
    onDone();
  };
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: (input: FlockInput) => (flockId ? flocks.update(flockId, input) : flocks.create(business.id, input)),
    onSuccess: () => finish(flockId ? 'Flock updated.' : 'Flock registered.'),
    ...report,
  });

  return {
    isEditing: Boolean(flockId),
    loading: Boolean(flockId) && existing.isPending,
    loadError: existing.error ? errorMessage(existing.error) : null,
    form,
    canEdit: can(flockId ? 'records.edit' : 'records.create'),
    busy: save.isPending,
    submit() {
      const input = form.validate();
      if (input) save.mutate(input);
    },
  };
}

export function useFlockDetailViewModel(flockId: string) {
  const { flocks } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: [...businessScope(business.id), 'flocks', 'detail', flockId],
    queryFn: () => flocks.get(flockId),
  });
  const setActive = useMutation({
    mutationFn: (isActive: boolean) => flocks.setActive(flockId, isActive),
    onSuccess: async (_result, isActive) => {
      await queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
      feedback.success(isActive ? 'Flock reactivated.' : 'Flock deactivated.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const isActive = detail.data?.isActive ?? true;

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    flock: detail.data ?? null,
    isActive,
    canEdit: can('records.edit'),
    busy: setActive.isPending,
    toggleActive: () => setActive.mutate(!isActive),
  };
}
