import { Redirect, router } from 'expo-router';

import { useEntryChoice } from '@/modules/account';
import { TeamAccessScreen, usePlatformAccess } from '@/modules/administration';

export default function TeamAccessRoute() {
  const { hasPlatformRole } = usePlatformAccess();
  const { setChoice } = useEntryChoice();

  if (hasPlatformRole) return <Redirect href="/platform" />;
  return (
    <TeamAccessScreen
      onUseBusiness={() => {
        setChoice('own_business');
        router.replace('/');
      }}
    />
  );
}
