import { router } from 'expo-router';

import { AskScreen, type CaptureTarget } from '@/modules/assistant';

const CAPTURE_ROUTES = { sale: '/sales/new', expense: '/expenses/new', activity: '/activities/new' } as const satisfies Record<CaptureTarget, string>;

export default function AskRoute() {
  return (
    <AskScreen
      onCapture={(target, prefill) => router.push({ pathname: CAPTURE_ROUTES[target], params: prefill })}
      onOpenHistory={() => router.push('/conversations')}
    />
  );
}
