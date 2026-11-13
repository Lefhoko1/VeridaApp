import { useMutation, useQuery } from '@tanstack/react-query';

import { errorMessage } from '@/core/errors/AppError';
import { useFeedback } from '@/design-system';

import type { AccountStatus } from '../../domain/models';
import { useAccountDependencies } from '../di';
import { useSession } from './useSession';

const BLOCKED_MESSAGES: Partial<Record<AccountStatus, string>> = {
  suspended: 'Your account has been suspended. Please contact Verida support.',
  deactivated: 'You deactivated this account. Please contact Verida support to reactivate it.',
  deletion_requested: 'This account is scheduled for deletion. Please contact Verida support if this is a mistake.',
};

// FR-A26. Row-level security already denies a blocked account all business data; this explains
// why, instead of leaving the user in an empty workspace.
export function useAccountAccess() {
  const { auth, profiles } = useAccountDependencies();
  const { session } = useSession();
  const userId = session?.userId;

  const profile = useQuery({
    queryKey: ['account', 'profile', userId],
    queryFn: () => profiles.getProfile(userId ?? ''),
    enabled: Boolean(userId),
  });
  const feedback = useFeedback();
  // A failed sign-out leaves the account on this device, so the user must be told rather than left guessing.
  const signOut = useMutation({ mutationFn: () => auth.signOut(), onError: (error) => feedback.error(errorMessage(error)) });

  return {
    // If the profile cannot be read, the database still protects the data, so the user is not locked out.
    blockedMessage: profile.data ? BLOCKED_MESSAGES[profile.data.accountStatus] ?? null : null,
    signOut: () => signOut.mutate(),
    signingOut: signOut.isPending,
  };
}
