import { router, useLocalSearchParams } from 'expo-router';

import { FinanceCategoryScreen } from '@/modules/administration';

export default function FinanceCategoryRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <FinanceCategoryScreen code={code} onCreated={() => undefined} onOpen={(next) => router.push({ pathname: '/admin/finance-categories/[code]', params: { code: next } })} />;
}
