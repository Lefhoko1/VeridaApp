import { router } from 'expo-router';

import { PlanScreen } from '@/modules/plan';

export default function PlanRoute() {
  return (
    <PlanScreen
      onNewTask={() => router.push('/tasks/new')}
      onNewGoal={() => router.push('/goals/new')}
      onOpenTask={(id) => router.push({ pathname: '/tasks/[id]', params: { id } })}
      onOpenGoal={(id) => router.push({ pathname: '/goals/[id]', params: { id } })}
    />
  );
}
