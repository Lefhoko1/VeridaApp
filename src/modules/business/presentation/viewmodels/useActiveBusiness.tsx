import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useSession } from '@/modules/account';

import type { Industry, Permission, Workspace } from '../../domain/models';
import { useBusinessDependencies } from '../di';

export const workspacesKey = (userId: string | undefined) => ['workspaces', userId] as const;

type ActiveBusinessState = {
  status: 'loading' | 'error' | 'none' | 'ready';
  error: string | null;
  retry: () => void;
  workspaces: Workspace[];
  business: Workspace | null;
  industry: Industry | null;
  industries: Industry[];
  permissions: readonly Permission[];
  switchTo: (businessId: string) => void;
  refresh: () => Promise<void>;
};

const ActiveBusinessContext = createContext<ActiveBusinessState | null>(null);

export function ActiveBusinessProvider({ children }: { children: ReactNode }) {
  const { businesses, activeBusinessStore } = useBusinessDependencies();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.userId;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void activeBusinessStore.load().then((stored) => setSelectedId((current) => current ?? stored));
  }, [activeBusinessStore]);

  const workspaces = useQuery({
    queryKey: workspacesKey(userId),
    queryFn: () => businesses.listWorkspaces(),
    enabled: Boolean(userId),
  });
  const industries = useQuery({
    queryKey: ['platform', 'industries'],
    queryFn: () => businesses.listIndustries(),
    enabled: Boolean(userId),
    staleTime: Infinity,
  });

  const business = useMemo(() => {
    const list = workspaces.data ?? [];
    return list.find((item) => item.id === selectedId) ?? list[0] ?? null;
  }, [workspaces.data, selectedId]);

  const permissions = useQuery({
    queryKey: ['business', business?.id, 'permissions'],
    queryFn: () => businesses.listPermissions(business?.id ?? ''),
    enabled: Boolean(business),
  });

  const switchTo = useCallback(
    (businessId: string) => {
      setSelectedId(businessId);
      void activeBusinessStore.save(businessId);
    },
    [activeBusinessStore],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: workspacesKey(userId) });
  }, [queryClient, userId]);

  const failure = workspaces.error ?? industries.error;
  const loading = workspaces.isPending || industries.isPending;

  const value = useMemo<ActiveBusinessState>(
    () => ({
      status: failure ? 'error' : loading ? 'loading' : business ? 'ready' : 'none',
      error: failure ? errorMessage(failure) : null,
      retry: () => {
        void workspaces.refetch();
        void industries.refetch();
      },
      workspaces: workspaces.data ?? [],
      business,
      industry: industries.data?.find((item) => item.code === business?.industryCode) ?? null,
      industries: industries.data ?? [],
      permissions: permissions.data ?? [],
      switchTo,
      refresh,
    }),
    // refetch functions are stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [failure, loading, business, workspaces.data, industries.data, permissions.data, switchTo, refresh],
  );

  return <ActiveBusinessContext.Provider value={value}>{children}</ActiveBusinessContext.Provider>;
}

export function useBusinessContext(): ActiveBusinessState {
  const value = useContext(ActiveBusinessContext);
  if (!value) throw new Error('useBusinessContext must be used inside ActiveBusinessProvider.');
  return value;
}

export type ActiveBusiness = {
  business: Workspace;
  industry: Industry | null;
  industries: Industry[];
  can: (permission: Permission) => boolean;
};

// For screens inside the workspace, where a business is guaranteed by the route guard.
export function useActiveBusiness(): ActiveBusiness {
  const { business, industry, industries, permissions } = useBusinessContext();
  if (!business) throw new Error('useActiveBusiness requires an active business.');
  const can = useCallback((permission: Permission) => permissions.includes(permission), [permissions]);
  return { business, industry, industries, can };
}
