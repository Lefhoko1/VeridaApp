import { router } from 'expo-router';

import { ReviewCentreScreen } from '@/modules/learning';

export default function ReviewCentreRoute() {
  return <ReviewCentreScreen onOpen={(id) => router.push({ pathname: '/review/[id]', params: { id } })} />;
}
