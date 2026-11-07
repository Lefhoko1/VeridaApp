import { goBack } from '@/composition/navigation';
import { ImportSalesScreen } from '@/modules/records';

export default function ImportSalesRoute() {
  return <ImportSalesScreen onDone={goBack} />;
}
