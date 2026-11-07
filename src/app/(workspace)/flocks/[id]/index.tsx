import { router, useLocalSearchParams } from 'expo-router';

import { FlockProfileScreen } from '@/modules/operations';

export default function FlockProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FlockProfileScreen flockId={id} onEdit={() => router.push({ pathname: '/flocks/[id]/edit', params: { id } })} />;
}
