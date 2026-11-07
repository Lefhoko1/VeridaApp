import { router, useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { ProductProfileScreen } from '@/modules/records';

export default function ProductProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductProfileScreen productId={id} onEdit={() => router.push({ pathname: '/products/[id]/edit', params: { id } })} onRemoved={goBack} />;
}
