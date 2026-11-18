import { router, useLocalSearchParams } from 'expo-router';

import { GoalProfileScreen } from '@/modules/plan';

export default function GoalRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <GoalProfileScreen
      goalId={id}
      onEdit={() => router.push({ pathname: '/goals/[id]/edit', params: { id } })}
      onOpenTask={(task) => router.push({ pathname: '/tasks/[id]', params: { id: task } })}
      onAddTask={() => router.push({ pathname: '/tasks/new', params: { goal: id } })}
    />
  );
}
