import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback, type StatusTone } from '@/design-system';

import { adminUserSchema } from '../../domain/validation';
import { useAdministrationDependencies } from '../di';

const scope = ['admin', 'users'];

export const STATUS_TONE = {
  active: 'ok',
  pending_verification: 'neutral',
  suspended: 'danger',
  deactivated: 'warn',
  deletion_requested: 'warn',
  erased: 'neutral',
} as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// FR-A22, FR-A23.
export function useUserSearchViewModel() {
  const { users } = useAdministrationDependencies();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // A half-typed date is ignored rather than sent.
  const filter = { query, status, from: ISO.test(from) ? from : '', to: ISO.test(to) ? to : '' };
  const list = useQuery({ queryKey: [...scope, 'list', filter], queryFn: () => users.search(filter) });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    items: list.data ?? [],
    query,
    setQuery,
    status,
    setStatus,
    from,
    setFrom,
    to,
    setTo,
  };
}

// FR-A24 to FR-A27.
export function useUserDetailViewModel(userId: string) {
  const { users } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(adminUserSchema, { fullName: '', phone: '' });
  const { reset } = form;
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [editing, setEditing] = useState(false);

  const detail = useQuery({ queryKey: [...scope, 'detail', userId], queryFn: () => users.get(userId) });

  useEffect(() => {
    if (detail.data) reset({ fullName: detail.data.fullName, phone: detail.data.phone ?? '' });
  }, [detail.data, reset]);

  const after = (message: string) => ({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      setConfirmingDeletion(false);
      feedback.success(message);
    },
    onError: (error: unknown) => {
      setConfirmingDeletion(false);
      feedback.error(errorMessage(error));
    },
  });

  const save = useMutation({ mutationFn: (input: { fullName: string; phone: string | null }) => users.update(userId, input), ...after('User updated.') });
  const setStatus = useMutation({ mutationFn: (status: 'active' | 'suspended') => users.setStatus(userId, status), ...after('Account status updated.') });
  const initiateDeletion = useMutation({ mutationFn: () => users.initiateDeletion(userId), ...after('Deletion has been initiated.') });

  const status = detail.data?.accountStatus;

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    user: detail.data ?? null,
    statusTone: (status ? STATUS_TONE[status] : 'neutral') as StatusTone,
    isErased: status === 'erased',
    canSuspend: status === 'active',
    canReactivate: status !== undefined && status !== 'active' && status !== 'pending_verification' && status !== 'erased',
    canDelete: status !== 'deletion_requested' && status !== 'erased',
    form,
    editing,
    startEditing: () => setEditing(true),
    cancelEditing() {
      if (detail.data) reset({ fullName: detail.data.fullName, phone: detail.data.phone ?? '' });
      setEditing(false);
    },
    busy: save.isPending || setStatus.isPending || initiateDeletion.isPending,
    save() {
      const input = form.validate();
      if (input) save.mutate(input, { onSuccess: () => setEditing(false) });
    },
    suspend: () => setStatus.mutate('suspended'),
    reactivate: () => setStatus.mutate('active'),
    confirmingDeletion,
    askToDelete: () => setConfirmingDeletion(true),
    cancelDelete: () => setConfirmingDeletion(false),
    confirmDelete: () => initiateDeletion.mutate(),
  };
}
