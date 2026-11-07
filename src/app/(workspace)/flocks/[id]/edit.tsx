import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { FlockFormScreen } from '@/modules/operations';

export default function EditFlockRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FlockFormScreen flockId={id} onDone={goBack} />;
}
