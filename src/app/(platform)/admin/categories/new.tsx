import { router } from 'expo-router';

import { BusinessCategoryScreen } from '@/modules/administration';

export default function NewBusinessCategoryRoute() {
  return (
    <BusinessCategoryScreen
      onCreated={(code) => router.replace({ pathname: '/admin/categories/[code]', params: { code } })}
      onOpenType={(code) => router.push({ pathname: '/admin/industries/[code]', params: { code } })}
    />
  );
}
