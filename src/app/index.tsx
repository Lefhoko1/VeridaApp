import { Redirect } from 'expo-router';

import { entryDestination } from '@/composition/entryDestination';
import { useEntryChoice, useSession } from '@/modules/account';
import { usePlatformAccess } from '@/modules/administration';
import { useBusinessContext } from '@/modules/business';

// Where "/" leads depends on who is signed in. The navigator falls back here whenever a guard closes.
export default function Index() {
  const { status } = useSession();
  const { choice } = useEntryChoice();
  const { status: businessStatus } = useBusinessContext();
  const { hasPlatformRole } = usePlatformAccess();

  // Anyone not signed in first sees the landing page, which explains Verida and leads to sign-in.
  if (status !== 'signed-in') return <Redirect href="/welcome" />;
  return <Redirect href={entryDestination({ choice, hasPlatformRole, businessStatus })} />;
}
