import { router, useLocalSearchParams } from 'expo-router';

import { AskScreen, type CaptureTarget } from '@/modules/assistant';

const CAPTURE_ROUTES = { sale: '/sales/new', expense: '/expenses/new', activity: '/activities/new', task: '/tasks/new' } as const satisfies Record<CaptureTarget, string>;

export default function AskRoute() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return (
    <AskScreen
      suggestedQuestion={q}
      onCapture={(target, prefill) => router.push({ pathname: CAPTURE_ROUTES[target], params: prefill })}
      onOpenHistory={() => router.push('/conversations')}
    />
  );
}
