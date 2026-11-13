import { router } from 'expo-router';

import { platformEntries } from '@/composition/platformEntries';
import { PlatformHubScreen, usePlatformAccess } from '@/modules/administration';
import { useBusinessContext } from '@/modules/business';

export default function PlatformRoute() {
  const { can } = usePlatformAccess();
  const { status } = useBusinessContext();

  const entries = platformEntries(can).map(({ title, description, icon, href }) => ({ title, description, icon, onPress: () => router.push(href) }));

  return <PlatformHubScreen entries={entries} setupAction={status === 'none' ? () => router.push('/setup') : undefined} workspaceAction={status === 'ready' ? () => router.replace('/overview') : undefined} />;
}
