import { goBack } from '@/composition/navigation';
import { ProductFormScreen } from '@/modules/records';

export default function NewProductRoute() {
  return <ProductFormScreen onDone={goBack} />;
}
