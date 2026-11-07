import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { SaleFormScreen } from '@/modules/records';

export default function EditSaleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SaleFormScreen saleId={id} onDone={goBack} />;
}
