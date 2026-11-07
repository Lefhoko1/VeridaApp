import { router } from 'expo-router';

// A screen opened directly from a link has no history, so "back" needs somewhere to go.
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
