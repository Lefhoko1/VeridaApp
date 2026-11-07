import { goBack } from '@/composition/navigation';
import { FlockFormScreen } from '@/modules/operations';

export default function NewFlockRoute() {
  return <FlockFormScreen onDone={goBack} />;
}
