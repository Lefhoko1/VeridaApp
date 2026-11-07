import { router } from 'expo-router';

import { BusinessListScreen } from '@/modules/administration';

export default function AdminBusinessesRoute() {
  return <BusinessListScreen onOpen={(id) => router.push({ pathname: '/admin/businesses/[id]', params: { id } })} />;
}
