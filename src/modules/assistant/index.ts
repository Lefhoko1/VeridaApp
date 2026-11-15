import type { SupabaseClient } from '@/core/supabase/client';

import { EdgeAssistantGateway, FallbackAssistantGateway } from './data/EdgeAssistantGateway';
import { EdgeReceiptReader } from './data/EdgeReceiptReader';
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

// Reads receipts for the records module, which the composition root connects it to.
export function createReceiptReader(client: SupabaseClient) {
  return new EdgeReceiptReader(client);
}

export type { BusinessFact, CaptureTarget, ReceiptReadingResult } from './domain/models';
export type { BusinessFactsProvider } from './domain/repositories';
export { AssistantDependenciesProvider } from './presentation/di';
export { AskScreen, ConversationsScreen } from './presentation/views/assistantScreens';
