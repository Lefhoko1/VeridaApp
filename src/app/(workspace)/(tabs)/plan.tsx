import { router } from 'expo-router';

import { PlanScreen } from '@/modules/plan';

export default function PlanRoute() {
  return (
    <PlanScreen
      onNewTask={() => router.push('/tasks/new')}
      onNewGoal={() => router.push('/goals/new')}
      onNewEvent={(onDate) => router.push({ pathname: '/events/new', params: onDate ? { on: onDate } : {} })}
      onOpenTask={(id) => router.push({ pathname: '/tasks/[id]', params: { id } })}
      onOpenGoal={(id) => router.push({ pathname: '/goals/[id]', params: { id } })}
      onOpenEvent={(id) => router.push({ pathname: '/events/[id]', params: { id } })}
      onOpenSeries={(id) => router.push({ pathname: '/series/[id]', params: { id } })}
      onOpenReview={(week) => router.push({ pathname: '/reviews/[week]', params: { week } })}
      onAssist={() => router.push('/assist')}
      onOpenSuggestion={(id) => router.push({ pathname: '/suggestions/[id]', params: { id } })}
      onOpenSettings={() => router.push('/plan-settings')}
    />
  );
}
