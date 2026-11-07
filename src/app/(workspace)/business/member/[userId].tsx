import { useLocalSearchParams } from 'expo-router';

import { MemberPermissionsScreen } from '@/modules/business';

export default function MemberPermissionsRoute() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <MemberPermissionsScreen userId={userId} />;
}
