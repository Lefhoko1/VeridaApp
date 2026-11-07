import { router } from 'expo-router';

import { IndustryDetailScreen } from '@/modules/administration';

export default function NewIndustryRoute() {
  return <IndustryDetailScreen onCreated={(code) => router.replace({ pathname: '/admin/industries/[code]', params: { code } })} />;
}
