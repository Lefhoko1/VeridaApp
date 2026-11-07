import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback, type StatusTone } from '@/design-system';

import type { AdminMember, BusinessConfiguration } from '../../domain/models';
import { businessConfigSchema } from '../../domain/validation';
import { useAdministrationDependencies } from '../di';
import { toPermissionRows } from './permissionRows';

const scope = ['admin', 'businesses'];

export const BUSINESS_TONE = { active: 'ok', suspended: 'danger', deactivated: 'warn', deletion_requested: 'warn' } as const;

// FR-B14, FR-B15.
export function useBusinessSearchViewModel() {
  const { businesses, industries } = useAdministrationDependencies();
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');

  const filter = { query, industry, location, status };
  const list = useQuery({ queryKey: [...scope, 'list', filter], queryFn: () => businesses.search(filter) });
  const options = useQuery({ queryKey: ['admin', 'industries', 'list'], queryFn: () => industries.listIndustries() });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    items: list.data ?? [],
    query,
    setQuery,
    industry,
    setIndustry,
    location,
    setLocation,
    status,
    setStatus,
    industryOptions: [{ value: '', label: 'All industries' }, ...(options.data ?? []).map((item) => ({ value: item.code, label: item.name }))],
  };
}

// FR-B16 to FR-B18.
export function useBusinessDetailViewModel(businessId: string) {
  const { businesses, industries } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(businessConfigSchema, { industryCode: '', stage: '', size: '', currency: '' });
  const { reset } = form;
  const [editing, setEditing] = useState(false);

  const detail = useQuery({ queryKey: [...scope, 'detail', businessId], queryFn: () => businesses.get(businessId) });
  const options = useQuery({ queryKey: ['admin', 'industries', 'list'], queryFn: () => industries.listIndustries() });

  useEffect(() => {
    if (!detail.data) return;
    const { industryCode, stage, size, currency } = detail.data;
    reset({ industryCode, stage, size, currency });
  }, [detail.data, reset]);

  const after = (message: string) => ({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope });
      feedback.success(message);
    },
    onError: (error: unknown) => feedback.error(errorMessage(error)),
  });

  const members = useQuery({ queryKey: [...scope, 'members', businessId], queryFn: () => businesses.listMembers(businessId) });
  const [removing, setRemoving] = useState<AdminMember | null>(null);
  const [transferring, setTransferring] = useState<AdminMember | null>(null);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);

  const afterTeamChange = (message: string) => {
    const closeDialogs = () => {
      setRemoving(null);
      setTransferring(null);
      setConfirmingDeletion(false);
    };
    return {
      onSuccess: async () => {
        closeDialogs();
        await queryClient.invalidateQueries({ queryKey: scope });
        feedback.success(message);
      },
      onError: (error: unknown) => {
        closeDialogs();
        feedback.error(errorMessage(error));
      },
    };
  };

  const changeRole = useMutation({ mutationFn: ({ userId, role }: { userId: string; role: string }) => businesses.changeMemberRole(businessId, userId, role), ...afterTeamChange('Role updated.') });
  const remove = useMutation({ mutationFn: (userId: string) => businesses.removeMember(businessId, userId), ...afterTeamChange('Member removed.') });
  const transfer = useMutation({ mutationFn: (userId: string) => businesses.transferOwnership(businessId, userId), ...afterTeamChange('Ownership transferred.') });
  const initiateDeletion = useMutation({ mutationFn: () => businesses.initiateDeletion(businessId), ...afterTeamChange('Deletion has been initiated.') });

  const save = useMutation({ mutationFn: (input: BusinessConfiguration) => businesses.updateConfiguration(businessId, input), ...after('Configuration updated.') });
  const setStatus = useMutation({ mutationFn: (status: 'active' | 'suspended') => businesses.setStatus(businessId, status), ...after('Business status updated.') });

  const status = detail.data?.status;

  return {
    loading: detail.isPending,
    error: detail.error ? errorMessage(detail.error) : null,
    business: detail.data ?? null,
    statusTone: (status ? BUSINESS_TONE[status] : 'neutral') as StatusTone,
    canSuspend: status === 'active',
    canReactivate: status === 'suspended',
    form,
    editing,
    startEditing: () => setEditing(true),
    cancelEditing() {
      if (detail.data) {
        const { industryCode, stage, size, currency } = detail.data;
        reset({ industryCode, stage, size, currency });
      }
      setEditing(false);
    },
    industryOptions: (options.data ?? []).map((item) => ({ value: item.code, label: item.name })),
    busy: save.isPending || setStatus.isPending || changeRole.isPending || remove.isPending || transfer.isPending || initiateDeletion.isPending,
    members: members.data ?? [],
    changeMemberRole: (userId: string, role: string) => changeRole.mutate({ userId, role }),
    removing,
    askToRemove: setRemoving,
    confirmRemove: () => {
      if (removing) remove.mutate(removing.userId);
    },
    transferring,
    askToTransfer: setTransferring,
    confirmTransfer: () => {
      if (transferring) transfer.mutate(transferring.userId);
    },
    canDelete: status !== 'deletion_requested',
    confirmingDeletion,
    askToDelete: () => setConfirmingDeletion(true),
    cancelDelete: () => setConfirmingDeletion(false),
    confirmDelete: () => initiateDeletion.mutate(),
    save() {
      const input = form.validate();
      if (input) save.mutate(input, { onSuccess: () => setEditing(false) });
    },
    suspend: () => setStatus.mutate('suspended'),
    reactivate: () => setStatus.mutate('active'),
  };
}

// FR-B22 from the Verida side.
export function useBusinessMemberPermissionsViewModel(businessId: string, userId: string) {
  const { businesses } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const queryKey = [...scope, 'member-permissions', businessId, userId];

  const permissions = useQuery({ queryKey, queryFn: () => businesses.memberPermissions(businessId, userId) });
  const members = useQuery({ queryKey: [...scope, 'members', businessId], queryFn: () => businesses.listMembers(businessId) });

  const set = useMutation({
    mutationFn: ({ code, allowed }: { code: string; allowed: boolean | null }) => businesses.setMemberPermission(businessId, userId, code, allowed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const member = members.data?.find((item) => item.userId === userId) ?? null;

  return {
    loading: permissions.isPending,
    error: permissions.error ? errorMessage(permissions.error) : null,
    retry: () => void permissions.refetch(),
    member,
    canEdit: member !== null && member.role !== 'owner',
    items: toPermissionRows(permissions.data ?? []),
    busy: set.isPending,
    setPermission: (code: string, allowed: boolean) => set.mutate({ code, allowed }),
    resetPermission: (code: string) => set.mutate({ code, allowed: null }),
  };
}
