import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { ExpenseFormScreen } from '@/modules/records';

export default function EditExpenseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseFormScreen expenseId={id} onDone={goBack} />;
}
