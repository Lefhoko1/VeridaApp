import { router } from 'expo-router';

import { BusinessProfileScreen } from '@/modules/business';

export default function BusinessRoute() {
  return (
    <BusinessProfileScreen
      onEdit={() => router.push('/business/edit')}
      onOpenMembers={() => router.push('/business/members')}
      onOpenProducts={() => router.push('/products')}
      onOpenHistory={() => router.push('/business/history')}
      onCreateBusiness={() => router.push('/business/new')}
    />
  );
}
