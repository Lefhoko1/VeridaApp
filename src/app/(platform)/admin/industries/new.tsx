import { router, useLocalSearchParams } from 'expo-router';

import { IndustryDetailScreen } from '@/modules/administration';

export default function NewIndustryRoute() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  return <IndustryDetailScreen categoryCode={category} onCreated={(code) => router.replace({ pathname: '/admin/industries/[code]', params: { code } })} />;
}
