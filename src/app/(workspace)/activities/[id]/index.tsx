import { router, useLocalSearchParams } from 'expo-router';

import { ActivityProfileScreen } from '@/modules/operations';

export default function ActivityProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ActivityProfileScreen activityId={id} onEdit={() => router.push({ pathname: '/activities/[id]/edit', params: { id } })} />;
}
