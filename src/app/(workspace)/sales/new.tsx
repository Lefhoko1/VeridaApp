import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { SaleFormScreen } from '@/modules/records';

// Parameters come from Ask Verida. The user reviews them in the form before saving.
export default function NewSaleRoute() {
  const { description, category, quantity, unit, unitPrice, occurredOn } = useLocalSearchParams<Record<string, string>>();
  const prefill = {
    ...(description ? { itemName: description } : {}),
    ...(category ? { category } : {}),
    ...(quantity ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    ...(unitPrice ? { unitPrice } : {}),
    ...(occurredOn ? { occurredOn } : {}),
  };
  return <SaleFormScreen prefill={prefill} onDone={goBack} />;
}
