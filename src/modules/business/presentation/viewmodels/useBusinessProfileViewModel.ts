import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useAttachment } from '@/core/files/useAttachment';
import { useFeedback } from '@/design-system';

import { industriesOf } from '../../domain/models';
import { useBusinessDependencies } from '../di';
import { useActiveBusiness, useBusinessContext } from './useActiveBusiness';

const STATUS_LABELS = {
  active: 'Active',
  deactivated: 'Deactivated',
  suspended: 'Suspended',
  deletion_requested: 'Deletion requested',
} as const;

const CHANGE_LABELS = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Removed' } as const;

// FR-C11: who changed what in this business, and when.
export function useChangeHistoryViewModel() {
  const { businesses } = useBusinessDependencies();
  const { business } = useActiveBusiness();
  const history = useQuery({
    queryKey: ['business', business.id, 'change-history'],
    queryFn: () => businesses.changeHistory(business.id),
  });

  return {
    loading: history.isPending,
    error: history.error ? errorMessage(history.error) : null,
    retry: () => void history.refetch(),
    items: (history.data ?? []).map((entry) => ({
      id: entry.id,
      title: `${CHANGE_LABELS[entry.action]}: ${entry.tableName.replace(/_/g, ' ')}`,
      detail: [entry.actorName ?? 'System', entry.occurredAt.slice(0, 16).replace('T', ' ')].join(' · '),
      fields: entry.action === 'UPDATE' ? entry.changedFields.map((field) => field.replace(/_/g, ' ')).join(', ') : '',
    })),
  };
}

// A short-lived link to the active business's logo, or null when it has none.
export function useBusinessLogoUrl(): string | null {
  const { files } = useBusinessDependencies();
  const { business } = useActiveBusiness();
  const link = useQuery({
    queryKey: ['business', business.id, 'logo', business.logoPath],
    queryFn: () => files.linkFor(business.logoPath ?? ''),
    enabled: Boolean(business.logoPath),
    staleTime: 30 * 60 * 1000,
  });
  return business.logoPath ? (link.data ?? null) : null;
}

export function useBusinessProfileViewModel() {
  const { businesses, files } = useBusinessDependencies();
  const { business, industries, can } = useActiveBusiness();
  const { workspaces, switchTo, refresh } = useBusinessContext();
  const feedback = useFeedback();
  const logoUrl = useBusinessLogoUrl();

  // The logo is saved as soon as it is chosen or removed, and the old file is deleted.
  const previousLogo = business.logoPath;
  const saveLogo = useMutation({
    mutationFn: async (path: string | null) => {
      await businesses.setLogo(business.id, path);
      if (previousLogo && previousLogo !== path) await files.remove(previousLogo).catch(() => undefined);
    },
    onSuccess: async (_result, path) => {
      await refresh();
      feedback.success(path ? 'Logo saved.' : 'Logo removed.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });
  const { mutate: persistLogo } = saveLogo;
  const onLogoChange = useCallback((path: string | null) => persistLogo(path), [persistLogo]);
  const logo = useAttachment({ store: files, businessId: business.id, folder: 'logo', onChange: onLogoChange });
  const { load } = logo;
  useEffect(() => {
    load(business.logoPath, logoUrl);
  }, [business.logoPath, logoUrl, load]);

  const setStatus = useMutation({
    mutationFn: (status: 'active' | 'deactivated' | 'deletion_requested') => businesses.setStatus(business.id, status),
    onSuccess: async () => {
      await refresh();
      feedback.success('The business status has been updated.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  const isOwner = business.myRole === 'owner';

  return {
    business,
    industryName: industriesOf(business)
      .filter((code) => code !== 'other' || !business.otherType)
      .map((code) => industries.find((item) => item.code === code)?.name ?? code)
      .concat(business.otherType ?? [])
      .join(', '),
    statusLabel: STATUS_LABELS[business.status],
    isActive: business.status === 'active',
    canEdit: can('business.manage'),
    logo: { ...logo, uploading: logo.uploading || saveLogo.isPending },
    canViewMembers: can('members.view'),
    canViewHistory: can('audit.view'),
    isOwner,
    otherWorkspaces: workspaces.filter((item) => item.id !== business.id),
    switchTo,
    busy: setStatus.isPending,
    deactivate: () => setStatus.mutate('deactivated'),
    reactivate: () => setStatus.mutate('active'),
    requestDeletion: () => setStatus.mutate('deletion_requested'),
  };
}
