import { router } from 'expo-router';

import { IndustryListScreen } from '@/modules/administration';

export default function AdminIndustriesRoute() {
  return (
    <IndustryListScreen
      onCreate={(category) => router.push({ pathname: '/admin/industries/new', params: category ? { category } : {} })}
      onCreateKpi={() => router.push('/admin/kpis/new')}
      onCreateCategory={() => router.push('/admin/categories/new')}
      onOpen={(code) => router.push({ pathname: '/admin/industries/[code]', params: { code } })}
      onOpenCategory={(code) => router.push({ pathname: '/admin/categories/[code]', params: { code } })}
    />
  );
}
