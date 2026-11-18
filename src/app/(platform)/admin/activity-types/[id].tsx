import { useLocalSearchParams } from 'expo-router';

import { ActivityFieldsScreen } from '@/modules/administration';

export default function AdminActivityFieldsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ActivityFieldsScreen activityTypeId={id} />;
}
