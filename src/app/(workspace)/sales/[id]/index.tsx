import { router, useLocalSearchParams } from 'expo-router';

import { SaleProfileScreen } from '@/modules/records';

export default function SaleProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SaleProfileScreen saleId={id} onEdit={() => router.push({ pathname: '/sales/[id]/edit', params: { id } })} />;
}
