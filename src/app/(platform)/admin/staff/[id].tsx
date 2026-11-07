import { useLocalSearchParams } from 'expo-router';

import { StaffPermissionsScreen } from '@/modules/administration';

export default function AdminStaffRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <StaffPermissionsScreen userId={id} />;
}
