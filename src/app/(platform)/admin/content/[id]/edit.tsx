import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { ContentFormScreen } from '@/modules/learning';

export default function EditAdminContentItemRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContentFormScreen contentId={id} onDone={goBack} />;
}
