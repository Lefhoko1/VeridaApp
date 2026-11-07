import { router } from 'expo-router';

import { LearnScreen } from '@/modules/learning';

export default function LearnRoute() {
  return (
    <LearnScreen
      onOpenLesson={(id) => router.push({ pathname: '/lessons/[id]', params: { id } })}
      onOpenPreferences={() => router.push('/learning-preferences')}
      onOpenReview={() => router.push('/review')}
    />
  );
}
