import { useLocalSearchParams } from 'expo-router';

import { IndustryDetailScreen } from '@/modules/administration';

export default function AdminIndustryRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <IndustryDetailScreen code={code} onCreated={() => undefined} />;
}
