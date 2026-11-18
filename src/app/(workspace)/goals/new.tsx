import { router } from 'expo-router';

import { GoalFormScreen } from '@/modules/plan';

export default function NewGoalRoute() {
  return <GoalFormScreen onDone={(id) => router.replace({ pathname: '/goals/[id]', params: { id } })} />;
}
