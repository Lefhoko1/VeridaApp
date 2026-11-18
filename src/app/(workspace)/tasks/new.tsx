import { router, useLocalSearchParams } from 'expo-router';

import { TaskFormScreen } from '@/modules/plan';

export default function NewTaskRoute() {
  const { goal } = useLocalSearchParams<{ goal?: string }>();
  return <TaskFormScreen goalId={goal} onDone={(id) => router.replace({ pathname: '/tasks/[id]', params: { id } })} />;
}
