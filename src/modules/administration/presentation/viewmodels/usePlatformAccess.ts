import { useMutation, useQuery } from '@tanstack/react-query';

import { useFeedback } from '@/design-system';
import { useAccountAccess, useCurrentUser, useSession } from '@/modules/account';

import type { PlatformPermission } from '../../domain/models';
import { useAdministrationDependencies } from '../di';

// Decides which screens to offer. The database independently refuses anyone without the role.
export function usePlatformAccess() {
  const { roles } = useAdministrationDependencies();
  const { session } = useSession();
  const userId = session?.userId;

  const myRoles = useQuery({
    queryKey: ['platform-access', userId],
    queryFn: () => roles.myRoles(),
    enabled: Boolean(userId),
    // If this can't load, the user simply isn't offered staff screens.
    retry: false,
  });

  const myPermissions = useQuery({
    queryKey: ['platform-access', userId, 'permissions'],
    queryFn: () => roles.myPermissions(),
    enabled: Boolean(userId),
    retry: false,
  });

  const held = myPermissions.data ?? [];

  return {
    loading: Boolean(userId) && myRoles.isPending,
    hasPlatformRole: (myRoles.data ?? []).length > 0,
    can: (permission: PlatformPermission) => held.includes(permission),
    recheck: async () => {
      await myPermissions.refetch();
      return (await myRoles.refetch()).data ?? [];
    },
  };
}

// For someone who chose the Verida team but holds no role yet. The route moves them on once they do.
export function useTeamAccessViewModel() {
  const { email } = useCurrentUser();
  const { recheck } = usePlatformAccess();
  const { signOut, signingOut } = useAccountAccess();
  const feedback = useFeedback();
  const check = useMutation({
    mutationFn: recheck,
    onSuccess: (roles) => {
      if (roles.length === 0) feedback.error('No Verida team role has been given to this account yet.');
    },
  });

  return { email, checking: check.isPending, check: () => check.mutate(), signOut, signingOut };
}
