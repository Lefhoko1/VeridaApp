import { router } from 'expo-router';

import { RolesScreen } from '@/modules/administration';

export default function AdminRolesRoute() {
  return <RolesScreen onOpenStaff={(userId) => router.push({ pathname: '/admin/staff/[id]', params: { id: userId } })} />;
}
