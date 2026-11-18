import { router, useLocalSearchParams } from 'expo-router';

import { FinanceCategoryScreen } from '@/modules/administration';

export default function NewFinanceCategoryRoute() {
  const { kind, parent } = useLocalSearchParams<{ kind?: 'sale' | 'expense'; parent?: string }>();
  return (
    <FinanceCategoryScreen
      kind={kind === 'sale' ? 'sale' : 'expense'}
      parentCode={parent}
      onCreated={(code) => router.replace({ pathname: '/admin/finance-categories/[code]', params: { code } })}
      onOpen={(code) => router.push({ pathname: '/admin/finance-categories/[code]', params: { code } })}
    />
  );
}
