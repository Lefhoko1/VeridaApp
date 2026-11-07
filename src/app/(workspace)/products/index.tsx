import { router } from 'expo-router';

import { ProductListScreen } from '@/modules/records';

export default function ProductsRoute() {
  return (
    <ProductListScreen
      onCreate={() => router.push('/products/new')}
      onOpen={(id) => router.push({ pathname: '/products/[id]', params: { id } })}
    />
  );
}
