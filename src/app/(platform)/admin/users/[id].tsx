import { useLocalSearchParams } from 'expo-router';

import { UserDetailScreen } from '@/modules/administration';

export default function AdminUserRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <UserDetailScreen userId={id} />;
}
