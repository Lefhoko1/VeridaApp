import { router } from 'expo-router';

import { PlanSettingsScreen } from '@/modules/plan';

export default function PlanSettingsRoute() {
  return <PlanSettingsScreen onDone={() => router.back()} />;
}
