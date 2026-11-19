import { router, useLocalSearchParams } from 'expo-router';

import { EventProfileScreen } from '@/modules/plan';

export default function EventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EventProfileScreen
      eventId={id}
      onEdit={() => router.push({ pathname: '/events/[id]/edit', params: { id } })}
      onOpenSeries={(series) => router.push({ pathname: '/series/[id]', params: { id: series } })}
    />
  );
}
