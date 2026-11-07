import { useLocalSearchParams } from 'expo-router';

import { goBack } from '@/composition/navigation';
import { ReviewLessonScreen } from '@/modules/learning';

export default function ReviewLessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReviewLessonScreen lessonId={id} onDone={goBack} />;
}
