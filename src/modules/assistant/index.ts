import type { SupabaseClient } from '@/core/supabase/client';

import { EdgeAssistantGateway, FallbackAssistantGateway } from './data/EdgeAssistantGateway';
import { RuleBasedAssistantGateway } from './data/RuleBasedAssistantGateway';
import { SupabaseConversationRepository } from './data/SupabaseConversationRepository';
import type { BusinessFactsProvider } from './domain/repositories';
import type { AssistantDependencies } from './presentation/di';

export function createAssistantDependencies(client: SupabaseClient, businessFacts: BusinessFactsProvider): AssistantDependencies {
  return {
    conversations: new SupabaseConversationRepository(client),
    gateway: new FallbackAssistantGateway(new EdgeAssistantGateway(client), new RuleBasedAssistantGateway()),
    businessFacts,
  };
}

export type { BusinessFact, CaptureTarget } from './domain/models';
export type { BusinessFactsProvider } from './domain/repositories';
export { AssistantDependenciesProvider } from './presentation/di';
export { AskScreen, ConversationsScreen } from './presentation/views/assistantScreens';
