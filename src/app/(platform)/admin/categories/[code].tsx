import { router, useLocalSearchParams } from 'expo-router';

import { BusinessCategoryScreen } from '@/modules/administration';

export default function AdminBusinessCategoryRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <BusinessCategoryScreen code={code} onCreated={() => undefined} onOpenType={(type) => router.push({ pathname: '/admin/industries/[code]', params: { code: type } })} />;
}
