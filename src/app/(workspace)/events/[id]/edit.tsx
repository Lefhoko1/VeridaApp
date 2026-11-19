import { router, useLocalSearchParams } from 'expo-router';

import { EventFormScreen } from '@/modules/plan';

export default function EditEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventFormScreen eventId={id} onDone={() => router.back()} />;
}
