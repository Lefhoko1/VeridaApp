import { router } from 'expo-router';

import { IndustryListScreen } from '@/modules/administration';

export default function AdminIndustriesRoute() {
  return (
    <IndustryListScreen
      onCreate={() => router.push('/admin/industries/new')}
      onCreateKpi={() => router.push('/admin/kpis/new')}
      onOpen={(code) => router.push({ pathname: '/admin/industries/[code]', params: { code } })}
    />
  );
}
