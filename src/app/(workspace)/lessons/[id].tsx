import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { LessonScreen } from '@/modules/learning';

export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LessonScreen lessonId={id} onDone={goBack} />;
}
