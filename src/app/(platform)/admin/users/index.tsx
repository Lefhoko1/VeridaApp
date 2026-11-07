import { router } from 'expo-router';

import { UserListScreen } from '@/modules/administration';

export default function AdminUsersRoute() {
  return <UserListScreen onOpen={(id) => router.push({ pathname: '/admin/users/[id]', params: { id } })} />;
}
