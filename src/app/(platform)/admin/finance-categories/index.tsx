import { router } from 'expo-router';

import { FinanceCategoryListScreen } from '@/modules/administration';

export default function FinanceCategoriesRoute() {
  return (
    <FinanceCategoryListScreen
      onOpen={(code) => router.push({ pathname: '/admin/finance-categories/[code]', params: { code } })}
      onCreate={(kind, parent) => router.push({ pathname: '/admin/finance-categories/new', params: parent ? { kind, parent } : { kind } })}
    />
  );
}
