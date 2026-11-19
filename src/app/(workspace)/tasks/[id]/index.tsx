import { router, useLocalSearchParams } from 'expo-router';

import { TaskProfileScreen } from '@/modules/plan';

export default function TaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <TaskProfileScreen
      taskId={id}
      onEdit={() => router.push({ pathname: '/tasks/[id]/edit', params: { id } })}
      onOpenGoal={(goal) => router.push({ pathname: '/goals/[id]', params: { id: goal } })}
      onOpenSeries={(series) => router.push({ pathname: '/series/[id]', params: { id: series } })}
    />
  );
}
