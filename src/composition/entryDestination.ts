import type { EntryChoice } from '@/modules/account';

type EntryState = {
  choice: EntryChoice | null;
  hasPlatformRole: boolean;
  businessStatus: 'loading' | 'none' | 'ready' | 'error';
};

// Where "/" leads for someone signed in. Choosing the Verida team only opens the staff tools for
// someone the database says holds a role. Everyone else is told they are waiting for access.
export function entryDestination({ choice, hasPlatformRole, businessStatus }: EntryState) {
  if (choice === 'verida_team') return hasPlatformRole ? ('/platform' as const) : ('/team-access' as const);
  if (businessStatus === 'none') return hasPlatformRole && choice === null ? ('/platform' as const) : ('/setup' as const);
  return '/overview' as const;
}
