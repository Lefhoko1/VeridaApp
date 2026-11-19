import { router, useLocalSearchParams } from 'expo-router';

import { EventFormScreen } from '@/modules/plan';

export default function NewEventRoute() {
  const { on } = useLocalSearchParams<{ on?: string }>();
  return <EventFormScreen onDate={on} onDone={(id) => router.replace({ pathname: '/events/[id]', params: { id } })} />;
}
