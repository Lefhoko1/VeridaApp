import { router } from 'expo-router';

import { ContentListScreen } from '@/modules/learning';

export default function AdminContentRoute() {
  return (
    <ContentListScreen
      onCreate={() => router.push('/admin/content/new')}
      onOpen={(id) => router.push({ pathname: '/admin/content/[id]', params: { id } })}
    />
  );
}
