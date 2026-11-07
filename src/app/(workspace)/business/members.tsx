import { router } from 'expo-router';

import { MembersScreen } from '@/modules/business';

export default function MembersRoute() {
  return <MembersScreen onOpenMember={(userId) => router.push({ pathname: '/business/member/[userId]', params: { userId } })} />;
}
