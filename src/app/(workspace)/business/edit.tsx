import { goBack } from '@/composition/navigation';
import { BusinessSetupScreen, useActiveBusiness } from '@/modules/business';

export default function EditBusinessRoute() {
  const { business } = useActiveBusiness();
  return <BusinessSetupScreen existing={business} onDone={goBack} />;
}
