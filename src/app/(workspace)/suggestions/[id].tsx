import { router, useLocalSearchParams } from 'expo-router';

import { SuggestionScreen } from '@/modules/plan';

export default function SuggestionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SuggestionScreen
      suggestionId={id}
      onReplaced={(next) => router.replace({ pathname: '/suggestions/[id]', params: { id: next } })}
      onOpenTask={(task) => router.push({ pathname: '/tasks/[id]', params: { id: task } })}
      onOpenGoal={(goal) => router.push({ pathname: '/goals/[id]', params: { id: goal } })}
      onOpenEvent={(event) => router.push({ pathname: '/events/[id]', params: { id: event } })}
      onAskVerida={(q) => router.navigate({ pathname: '/ask', params: { q } })}
    />
  );
}
