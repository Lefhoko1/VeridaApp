import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { ProductFormScreen } from '@/modules/records';

export default function EditProductRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductFormScreen productId={id} onDone={goBack} />;
}
