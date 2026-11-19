import { router, useLocalSearchParams } from 'expo-router';

import { SeriesProfileScreen } from '@/modules/plan';

export default function SeriesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SeriesProfileScreen
      ruleId={id}
      onEdit={() => router.push({ pathname: '/series/[id]/edit', params: { id } })}
      onOpenTask={(task) => router.push({ pathname: '/tasks/[id]', params: { id: task } })}
    />
  );
}
