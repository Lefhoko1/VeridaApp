import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { todayIso } from '@/core/format/format';
import { useForm } from '@/core/forms/useForm';
import { rangeStart, type DateRangeKey } from '@/core/time/dateRange';
import { useFeedback } from '@/design-system';

import type { DeletionRequest, PlatformRole, RoleAssignment } from '../../domain/models';
import { EDITABLE_STAFF_ROLES, grantRoleSchema, retentionSchema } from '../../domain/validation';
import { useAdministrationDependencies } from '../di';
import { toPermissionRows } from './permissionRows';

// FR-I12.
export function useRolesViewModel() {
  const { roles } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const scope = ['admin', 'roles'];
  const form = useForm(grantRoleSchema, { email: '', role: 'learning_reviewer' });
  const [revoking, setRevoking] = useState<RoleAssignment | null>(null);

  const assignments = useQuery({ queryKey: [...scope, 'assignments'], queryFn: () => roles.listAssignments() });
  const matrix = useQuery({ queryKey: [...scope, 'matrix'], queryFn: () => roles.permissionMatrix() });
  const staffMatrix = useQuery({ queryKey: [...scope, 'staff-matrix'], queryFn: () => roles.staffRoleMatrix() });

  const refresh = () => queryClient.invalidateQueries({ queryKey: scope });
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const grant = useMutation({
    mutationFn: ({ email, role }: { email: string; role: PlatformRole }) => roles.grant(email, role),
    onSuccess: async () => {
      form.reset({ email: '', role: 'learning_reviewer' });
      await refresh();
      feedback.success('Role granted.');
    },
    ...report,
  });
  const revoke = useMutation({
    mutationFn: ({ userId, role }: RoleAssignment) => roles.revoke(userId, role),
    onSuccess: async () => {
      setRevoking(null);
      await refresh();
      feedback.success('Role removed.');
    },
    onError: (error: unknown) => {
      setRevoking(null);
      feedback.error(errorMessage(error));
    },
  });
  const setPermission = useMutation({
    mutationFn: ({ role, permission, allowed }: { role: string; permission: string; allowed: boolean }) => roles.setRolePermission(role, permission, allowed),
    onSuccess: refresh,
    ...report,
  });

  const setStaffRolePermission = useMutation({
    mutationFn: ({ role, permission, allowed }: { role: string; permission: string; allowed: boolean }) => roles.setStaffRolePermission(role, permission, allowed),
    onSuccess: refresh,
    ...report,
  });

  const granted = matrix.data?.granted ?? [];
  const staffGranted = staffMatrix.data?.granted ?? [];

  return {
    loading: assignments.isPending || matrix.isPending,
    error: assignments.error || matrix.error ? errorMessage(assignments.error ?? matrix.error) : null,
    retry() {
      void assignments.refetch();
      void matrix.refetch();
    },
    assignments: assignments.data ?? [],
    form,
    granting: grant.isPending,
    submitGrant() {
      const input = form.validate();
      if (input) grant.mutate(input);
    },
    revoking,
    askToRevoke: setRevoking,
    confirmRevoke() {
      if (revoking) revoke.mutate(revoking);
    },
    revokeBusy: revoke.isPending,
    // Owners always hold everything, so they are not offered as editable.
    roles: (matrix.data?.roles ?? []).filter((role) => role.code !== 'owner'),
    permissions: matrix.data?.permissions ?? [],
    isGranted: (role: string, permission: string) => granted.some((item) => item.role === role && item.permission === permission),
    setPermission: (role: string, permission: string, allowed: boolean) => setPermission.mutate({ role, permission, allowed }),
    matrixBusy: setPermission.isPending,
    staffRoles: EDITABLE_STAFF_ROLES,
    staffPermissions: staffMatrix.data?.permissions ?? [],
    isStaffGranted: (role: string, permission: string) => staffGranted.some((item) => item.role === role && item.permission === permission),
    setStaffRolePermission: (role: string, permission: string, allowed: boolean) => setStaffRolePermission.mutate({ role, permission, allowed }),
    staffMatrixBusy: setStaffRolePermission.isPending,
  };
}

// FR-I12: one person's permissions, on top of their role.
export function useStaffPermissionsViewModel(userId: string) {
  const { roles } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const queryKey = ['admin', 'roles', 'staff', userId];

  const permissions = useQuery({ queryKey, queryFn: () => roles.staffPermissions(userId) });
  const assignments = useQuery({ queryKey: ['admin', 'roles', 'assignments'], queryFn: () => roles.listAssignments() });

  const set = useMutation({
    mutationFn: ({ code, allowed }: { code: string; allowed: boolean | null }) => roles.setStaffPermission(userId, code, allowed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const mine = (assignments.data ?? []).filter((assignment) => assignment.userId === userId);
  const isAdministrator = mine.some((assignment) => assignment.role === 'administrator');

  return {
    loading: permissions.isPending,
    error: permissions.error ? errorMessage(permissions.error) : null,
    retry: () => void permissions.refetch(),
    name: mine[0]?.fullName ?? 'Staff member',
    roles: mine.map((assignment) => assignment.role.replace(/_/g, ' ')).join(', '),
    isAdministrator,
    items: toPermissionRows(permissions.data ?? []),
    busy: set.isPending,
    setPermission: (code: string, allowed: boolean) => set.mutate({ code, allowed }),
    resetPermission: (code: string) => set.mutate({ code, allowed: null }),
  };
}

const DELETION_LABEL = { account: 'Account', business: 'Business', learner_profile: 'Learner profile' } as const;

// FR-A21, FR-A27, FR-B13: requests wait out the retention period, then staff decide.
export function useDeletionQueueViewModel() {
  const { deletions } = useAdministrationDependencies();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const scope = ['admin', 'deletions'];
  const form = useForm(retentionSchema, { days: '' });
  const { reset } = form;
  const [erasing, setErasing] = useState<DeletionRequest | null>(null);

  const queue = useQuery({ queryKey: [...scope, 'queue'], queryFn: () => deletions.queue() });
  const retention = useQuery({ queryKey: [...scope, 'retention'], queryFn: () => deletions.retentionDays() });

  useEffect(() => {
    if (retention.data !== undefined) reset({ days: String(retention.data) });
  }, [retention.data, reset]);

  // Erasing or cancelling also changes what the user and business lists show.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const saveRetention = useMutation({
    mutationFn: (days: number) => deletions.setRetentionDays(days),
    onSuccess: async () => {
      await refresh();
      feedback.success('Retention period updated.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });
  const erase = useMutation({
    mutationFn: (request: DeletionRequest) => deletions.erase(request),
    onSuccess: async () => {
      setErasing(null);
      await refresh();
      feedback.success('Permanently erased.');
    },
    onError: (error) => {
      setErasing(null);
      feedback.error(errorMessage(error));
    },
  });
  const cancel = useMutation({
    mutationFn: (request: DeletionRequest) => deletions.cancel(request),
    onSuccess: async () => {
      await refresh();
      feedback.success('Deletion request cancelled.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const now = new Date().toISOString();

  return {
    loading: queue.isPending,
    error: queue.error ? errorMessage(queue.error) : null,
    retry: () => void queue.refetch(),
    items: (queue.data ?? []).map((request) => ({
      request,
      kindLabel: DELETION_LABEL[request.kind],
      // The database checks this again, using its own clock.
      canErase: new Date(request.erasableFrom).toISOString() <= now,
    })),
    form,
    busy: saveRetention.isPending || erase.isPending || cancel.isPending,
    saveRetention() {
      const input = form.validate();
      if (input) saveRetention.mutate(input.days);
    },
    erasing,
    askToErase: setErasing,
    confirmErase() {
      if (erasing) erase.mutate(erasing);
    },
    cancelRequest: (request: DeletionRequest) => cancel.mutate(request),
  };
}

// FR-I09, FR-I10.
export function useMonitoringViewModel() {
  const { monitoring } = useAdministrationDependencies();
  const scope = ['admin', 'monitoring'];
  const stats = useQuery({ queryKey: [...scope, 'stats'], queryFn: () => monitoring.usageStats() });
  const events = useQuery({ queryKey: [...scope, 'events'], queryFn: () => monitoring.recentEvents() });
  const services = useQuery({ queryKey: [...scope, 'services'], queryFn: () => monitoring.checkServices(), staleTime: 0 });
  const queryClient = useQueryClient();

  const all = stats.data ?? [];

  return {
    loading: stats.isPending,
    error: stats.error ? errorMessage(stats.error) : null,
    refreshing: stats.isRefetching || services.isRefetching,
    refresh: () => void queryClient.invalidateQueries({ queryKey: scope }),
    stats: all.filter((stat) => !stat.metric.startsWith('industry:')),
    byIndustry: all.filter((stat) => stat.metric.startsWith('industry:')),
    services: services.data ?? [],
    checkingServices: services.isPending,
    events: events.data ?? [],
  };
}

// FR-I11.
export function useAuditViewModel() {
  const { monitoring } = useAdministrationDependencies();
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeKey>('last30');

  const filter = { table: table.trim(), action, from: rangeStart(dateRange, todayIso()) };
  const log = useQuery({ queryKey: ['admin', 'audit', filter], queryFn: () => monitoring.auditLog(filter) });

  return {
    loading: log.isPending,
    error: log.error ? errorMessage(log.error) : null,
    retry: () => void log.refetch(),
    items: log.data ?? [],
    table,
    setTable,
    action,
    setAction,
    dateRange,
    setDateRange: (value: string) => setDateRange(value as DateRangeKey),
  };
}

// FR-G21, FR-G22: metadata only, never what anyone asked.
export function useAiLogsViewModel() {
  const { monitoring } = useAdministrationDependencies();
  const [outcome, setOutcome] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeKey>('last30');

  const today = todayIso();
  const from = rangeStart(dateRange, today);
  const usage = useQuery({
    queryKey: ['admin', 'ai', 'usage', from],
    queryFn: () => monitoring.aiUsage(from ?? '2000-01-01', today),
  });
  const list = useQuery({
    queryKey: ['admin', 'ai', 'list', { outcome, from }],
    queryFn: () => monitoring.aiRequests({ outcome, from }),
  });

  return {
    loading: list.isPending,
    error: list.error ? errorMessage(list.error) : null,
    retry: () => void list.refetch(),
    usage: usage.data ?? null,
    items: list.data ?? [],
    outcome,
    setOutcome,
    dateRange,
    setDateRange: (value: string) => setDateRange(value as DateRangeKey),
  };
}
