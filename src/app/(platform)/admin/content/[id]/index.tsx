import { router, useLocalSearchParams } from 'expo-router';

import { ContentProfileScreen } from '@/modules/learning';

export default function AdminContentItemRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContentProfileScreen contentId={id} onEdit={() => router.push({ pathname: '/admin/content/[id]/edit', params: { id } })} />;
}
