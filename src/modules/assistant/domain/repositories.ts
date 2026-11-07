import type { AnswerConfidence, AssistantAnswer, AssistantContext, ChatMessage, Conversation } from './models';

export interface ConversationRepository {
  list(businessId: string, search?: string): Promise<Conversation[]>;
  messages(conversationId: string): Promise<ChatMessage[]>;
  start(businessId: string, title: string): Promise<string>;
  addMessage(conversationId: string, role: ChatMessage['role'], content: string, confidence: AnswerConfidence | null): Promise<void>;
  remove(conversationId: string): Promise<void>;
  logRequest(entry: { businessId: string; intent: string; outcome: 'answered' | 'insufficient_data' | 'failed'; latencyMs: number }): Promise<void>;
}

// The AI service boundary. Implementations may reject, and the app then uses its built-in rules.
export interface AssistantGateway {
  answer(question: string, context: AssistantContext): Promise<AssistantAnswer>;
}

// Port onto the analytics service, wired up at the composition root so this module
// has no dependency on analytics.
export type BusinessFactsProvider = (input: { businessId: string; currency: string }) => Promise<{ periodLabel: string; facts: AssistantContext['facts'] }>;
