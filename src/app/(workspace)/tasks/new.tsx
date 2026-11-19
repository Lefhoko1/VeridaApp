import { router, useLocalSearchParams } from 'expo-router';

import { TaskFormScreen } from '@/modules/plan';

export default function NewTaskRoute() {
  // goal: started from a goal. title and dueOn: handed over by Ask Verida, for the person to review.
  const { goal, title, dueOn } = useLocalSearchParams<{ goal?: string; title?: string; dueOn?: string }>();
  return (
    <TaskFormScreen
      goalId={goal}
      prefill={{ title, dueOn }}
      onDone={(id) => router.replace({ pathname: '/tasks/[id]', params: { id } })}
      onSeriesCreated={(id) => router.replace({ pathname: '/series/[id]', params: { id } })}
      onQueued={() => router.back()}
    />
  );
}
