import { router } from 'expo-router';

import { DashboardScreen } from '@/modules/analytics';

export default function OverviewRoute() {
  return <DashboardScreen onAddRecord={() => router.push('/records')} onViewRecords={() => router.push('/records')} />;
}
