import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

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

  // On the website a visitor first sees the landing page; the app opens straight at sign-in.
  if (status !== 'signed-in') return <Redirect href={Platform.OS === 'web' ? '/welcome' : '/sign-in'} />;
  return <Redirect href={entryDestination({ choice, hasPlatformRole, businessStatus })} />;
}
