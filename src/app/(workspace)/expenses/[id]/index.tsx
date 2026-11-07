import { router, useLocalSearchParams } from 'expo-router';

import { ExpenseProfileScreen } from '@/modules/records';

export default function ExpenseProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseProfileScreen expenseId={id} onEdit={() => router.push({ pathname: '/expenses/[id]/edit', params: { id } })} />;
}
