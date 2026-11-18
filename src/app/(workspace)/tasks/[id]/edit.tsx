import { router, useLocalSearchParams } from 'expo-router';

import { TaskFormScreen } from '@/modules/plan';

export default function EditTaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskFormScreen taskId={id} onDone={() => router.back()} />;
}
