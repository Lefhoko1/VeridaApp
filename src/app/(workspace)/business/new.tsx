import { router } from 'expo-router';

import { BusinessSetupScreen } from '@/modules/business';

export default function NewBusinessRoute() {
  return <BusinessSetupScreen onDone={() => router.replace('/overview')} />;
}
