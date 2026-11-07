import { createDependencies } from '@/core/di/createDependencies';

import type { AssistantGateway, BusinessFactsProvider, ConversationRepository } from '../domain/repositories';

export type AssistantDependencies = {
  conversations: ConversationRepository;
  gateway: AssistantGateway;
  businessFacts: BusinessFactsProvider;
};

export const { Provider: AssistantDependenciesProvider, useDependencies: useAssistantDependencies } =
  createDependencies<AssistantDependencies>('Assistant');
