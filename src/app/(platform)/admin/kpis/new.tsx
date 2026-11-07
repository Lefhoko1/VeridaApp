import { goBack } from '@/composition/navigation';
import { KpiFormScreen } from '@/modules/administration';

export default function NewKpiRoute() {
  return <KpiFormScreen onDone={goBack} />;
}
