import { router } from 'expo-router';

import { ProfileScreen } from '@/modules/account';
import { usePlatformAccess } from '@/modules/administration';

export default function AccountRoute() {
  const { hasPlatformRole } = usePlatformAccess();
  return <ProfileScreen onOpenSecurity={() => router.push('/account/security')} onOpenPlatform={hasPlatformRole ? () => router.push('/platform') : undefined} />;
}
