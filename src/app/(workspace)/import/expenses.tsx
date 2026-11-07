import { goBack } from '@/composition/navigation';
import { ImportExpensesScreen } from '@/modules/records';

export default function ImportExpensesRoute() {
  return <ImportExpensesScreen onDone={goBack} />;
}
