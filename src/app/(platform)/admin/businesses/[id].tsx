import { router, useLocalSearchParams } from 'expo-router';

import { BusinessDetailScreen } from '@/modules/administration';

export default function AdminBusinessRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BusinessDetailScreen businessId={id} onOpenMember={(userId) => router.push({ pathname: '/admin/business-members/[businessId]/[userId]', params: { businessId: id, userId } })} />;
}
