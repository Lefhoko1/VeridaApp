import { router, useLocalSearchParams } from 'expo-router';

import { ReviewScreen } from '@/modules/plan';

export default function ReviewRoute() {
  const { week } = useLocalSearchParams<{ week: string }>();
  return (
    <ReviewScreen
      weekStart={week}
      onEdit={() => router.push({ pathname: '/reviews/[week]/edit', params: { week } })}
      onOpenTask={(id) => router.push({ pathname: '/tasks/[id]', params: { id } })}
      onAddTask={() => router.push('/tasks/new')}
    />
  );
}
