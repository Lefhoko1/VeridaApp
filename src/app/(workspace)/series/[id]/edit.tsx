import { router, useLocalSearchParams } from 'expo-router';

import { SeriesFormScreen } from '@/modules/plan';

export default function EditSeriesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SeriesFormScreen ruleId={id} onDone={() => router.back()} />;
}
