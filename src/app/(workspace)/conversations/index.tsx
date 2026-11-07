import { router } from 'expo-router';

import { ConversationsScreen } from '@/modules/assistant';

export default function ConversationsRoute() {
  return <ConversationsScreen onOpen={(id) => router.push({ pathname: '/conversations/[id]', params: { id } })} />;
}
