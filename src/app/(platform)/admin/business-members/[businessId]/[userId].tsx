import { useLocalSearchParams } from 'expo-router';

import { BusinessMemberPermissionsScreen } from '@/modules/administration';

export default function AdminBusinessMemberRoute() {
  const { businessId, userId } = useLocalSearchParams<{ businessId: string; userId: string }>();
  return <BusinessMemberPermissionsScreen businessId={businessId} userId={userId} />;
}
