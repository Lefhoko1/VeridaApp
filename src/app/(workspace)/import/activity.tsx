import { goBack } from '@/composition/navigation';
import { ImportActivityScreen } from '@/modules/operations';

export default function ImportActivityRoute() {
  return <ImportActivityScreen onDone={goBack} />;
}
