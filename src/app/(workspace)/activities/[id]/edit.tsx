import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { ActivityFormScreen } from '@/modules/operations';

export default function EditActivityRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ActivityFormScreen activityId={id} onDone={goBack} />;
}
