import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { ExpenseFormScreen } from '@/modules/records';

// Parameters come from Ask Verida. The user reviews them in the form before saving.
export default function NewExpenseRoute() {
  const { description, category, amount, quantity, unit, occurredOn } = useLocalSearchParams<Record<string, string>>();
  const prefill = {
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
    ...(amount ? { amount } : {}),
    ...(quantity ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    ...(occurredOn ? { occurredOn } : {}),
  };
  return <ExpenseFormScreen prefill={prefill} onDone={goBack} />;
}
