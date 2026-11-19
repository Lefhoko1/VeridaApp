import { router, useLocalSearchParams } from 'expo-router';

import { ReviewFormScreen } from '@/modules/plan';

export default function EditReviewRoute() {
  const { week } = useLocalSearchParams<{ week: string }>();
  return <ReviewFormScreen weekStart={week} onDone={() => router.back()} />;
}
