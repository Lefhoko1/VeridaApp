import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';

import type { AssignableRole, Member } from '../../domain/models';
import { inviteSchema } from '../../domain/validation';
import { useBusinessDependencies } from '../di';
import { useActiveBusiness, useBusinessContext } from './useActiveBusiness';

export function useMembersViewModel() {
  const { memberships } = useBusinessDependencies();
  const { business, can } = useActiveBusiness();
  const { refresh } = useBusinessContext();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const scope = ['business', business.id, 'members'];
  const canManage = can('members.manage');

  const members = useQuery({
    queryKey: [...scope, 'list'],
    queryFn: () => memberships.listMembers(business.id),
  });
  const invitations = useQuery({
    queryKey: [...scope, 'invitations'],
    queryFn: () => memberships.listSentInvitations(business.id),
    enabled: canManage,
  });

  const inviteForm = useForm(inviteSchema, { email: '', role: 'staff' });
  const [removing, setRemoving] = useState<Member | null>(null);
  const [transferring, setTransferring] = useState<Member | null>(null);
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();

  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const invite = useMutation({
    mutationFn: (input: { email: string; role: AssignableRole }) => memberships.invite(business.id, input.email, input.role),
    onSuccess: async () => {
      inviteForm.reset({ email: '', role: 'staff' });
      await refreshMembers();
      feedback.success('Invitation sent.');
    },
    ...report,
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) => memberships.revokeInvitation(invitationId),
    onSuccess: async () => {
      await refreshMembers();
      feedback.success('Invitation withdrawn.');
    },
    ...report,
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AssignableRole }) => memberships.changeRole(business.id, userId, role),
    onSuccess: async () => {
      await refreshMembers();
      feedback.success('Role updated.');
    },
    ...report,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => memberships.removeMember(business.id, userId),
    onSuccess: async () => {
      setRemoving(null);
      await refreshMembers();
      feedback.success('Member removed.');
    },
    ...report,
  });
  const transfer = useMutation({
    mutationFn: (userId: string) => memberships.transferOwnership(business.id, userId),
    onSuccess: async () => {
      setTransferring(null);
      // The caller's own role and permissions have just changed too.
      await queryClient.invalidateQueries({ queryKey: ['business', business.id] });
      await refresh();
      feedback.success('Ownership transferred. You are now a manager of this business.');
    },
    onError: (error: unknown) => {
      setTransferring(null);
      feedback.error(errorMessage(error));
    },
  });

  return {
    loading: members.isPending,
    error: members.error ? errorMessage(members.error) : null,
    retry: () => void members.refetch(),
    members: (members.data ?? []).filter((member) => !term || member.fullName.toLowerCase().includes(term) || member.email.toLowerCase().includes(term)),
    search,
    setSearch,
    invitations: invitations.data ?? [],
    canManage,
    inviteForm,
    inviting: invite.isPending,
    submitInvite() {
      const input = inviteForm.validate();
      if (input) invite.mutate(input);
    },
    revokeInvitation: (invitationId: string) => revoke.mutate(invitationId),
    changeRole: (userId: string, role: AssignableRole) => changeRole.mutate({ userId, role }),
    removing,
    askToRemove: setRemoving,
    confirmRemove: () => {
      if (removing) remove.mutate(removing.userId);
    },
    removeBusy: remove.isPending,
    isOwner: business.myRole === 'owner',
    transferring,
    askToTransfer: setTransferring,
    confirmTransfer: () => {
      if (transferring) transfer.mutate(transferring.userId);
    },
    transferBusy: transfer.isPending,
  };
}

// FR-B22.
export function useMemberPermissionsViewModel(userId: string) {
  const { memberships } = useBusinessDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const queryKey = ['business', business.id, 'members', 'permissions', userId];

  const permissions = useQuery({ queryKey, queryFn: () => memberships.memberPermissions(business.id, userId) });
  const members = useQuery({
    queryKey: ['business', business.id, 'members', 'list'],
    queryFn: () => memberships.listMembers(business.id),
  });

  const set = useMutation({
    mutationFn: ({ code, allowed }: { code: string; allowed: boolean | null }) => memberships.setMemberPermission(business.id, userId, code, allowed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const member = members.data?.find((item) => item.userId === userId) ?? null;

  return {
    loading: permissions.isPending,
    error: permissions.error ? errorMessage(permissions.error) : null,
    retry: () => void permissions.refetch(),
    member,
    // Owners always hold everything, so there is nothing to change.
    canEdit: can('members.manage') && member !== null && member.role !== 'owner',
    items: (permissions.data ?? []).map((item) => ({
      code: item.code,
      description: item.description,
      allowed: item.allowed,
      isPersonal: item.override !== null,
      roleDefault: item.fromRole,
    })),
    busy: set.isPending,
    setPermission: (code: string, allowed: boolean) => set.mutate({ code, allowed }),
    resetPermission: (code: string) => set.mutate({ code, allowed: null }),
  };
}

// FR-B24. Also shown before a first workspace exists, so invited staff need not create one.
export function useReceivedInvitationsViewModel() {
  const { memberships } = useBusinessDependencies();
  const { refresh, switchTo } = useBusinessContext();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const queryKey = ['invitations', 'received'];

  const invitations = useQuery({ queryKey, queryFn: () => memberships.listReceivedInvitations() });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => memberships.respondToInvitation(id, accept),
    onSuccess: async (_result, { accept }) => {
      await queryClient.invalidateQueries({ queryKey });
      await refresh();
      feedback.success(accept ? 'You have joined the business.' : 'Invitation declined.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    invitations: invitations.data ?? [],
    loading: invitations.isPending,
    checking: invitations.isRefetching,
    check: () => invitations.refetch(),
    busy: respond.isPending,
    accept: (id: string) => respond.mutate({ id, accept: true }),
    decline: (id: string) => respond.mutate({ id, accept: false }),
    switchTo,
  };
}

// The active business's members as choices, for other modules that assign work to a person.
// Someone who cannot see members gets an empty list rather than an error.
export function useMemberOptions() {
  const { memberships } = useBusinessDependencies();
  const { business, can } = useActiveBusiness();
  const members = useQuery({
    queryKey: ['business', business.id, 'members', 'list'],
    queryFn: () => memberships.listMembers(business.id),
    enabled: can('members.view'),
  });
  const list = members.data ?? [];
  return {
    options: list.map((member) => ({ value: member.userId, label: member.fullName || member.email })),
    // For a business that gives tasks only to its owners.
    ownerOptions: list.filter((member) => member.role === 'owner').map((member) => ({ value: member.userId, label: member.fullName || member.email })),
    nameOf: (userId: string | null) => (userId ? (list.find((member) => member.userId === userId)?.fullName ?? null) : null),
  };
}
