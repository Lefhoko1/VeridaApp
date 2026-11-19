import { router, useLocalSearchParams } from 'expo-router';

import { PlanAssistScreen } from '@/modules/plan';

export default function PlanAssistRoute() {
  const { goal } = useLocalSearchParams<{ goal?: string }>();
  return (
    <PlanAssistScreen
      kind={goal ? 'goal_breakdown' : undefined}
      goalId={goal}
      onDone={(id) => router.replace({ pathname: '/suggestions/[id]', params: { id } })}
    />
  );
}
