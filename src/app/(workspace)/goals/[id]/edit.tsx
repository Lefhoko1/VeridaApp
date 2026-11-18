import { router, useLocalSearchParams } from 'expo-router';

import { GoalFormScreen } from '@/modules/plan';

export default function EditGoalRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GoalFormScreen goalId={id} onDone={() => router.back()} />;
}
