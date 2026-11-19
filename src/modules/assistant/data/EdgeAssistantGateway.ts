import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import type { SupabaseClient } from '@/core/supabase/client';

import type { AssistantAnswer, AssistantContext } from '../domain/models';
import type { AssistantGateway } from '../domain/repositories';

const answerSchema = z.object({
  text: z.string().min(1),
  confidence: z.enum(['verified', 'estimate', 'guidance', 'insufficient_data']),
  intent: z.string(),
  suggestedCapture: z.enum(['sale', 'expense', 'activity', 'task']).nullable(),
  capturePrefill: z.record(z.string(), z.string()),
  missingFields: z.array(z.string()),
});

// The AI service. It works out the business's figures itself, as the signed-in user, so only
// the question and which business it concerns are sent from here.
export class EdgeAssistantGateway implements AssistantGateway {
  constructor(private readonly client: SupabaseClient) {}

  async answer(question: string, context: AssistantContext): Promise<AssistantAnswer> {
    const { data, error } = await this.client.functions.invoke('ask-verida', {
      body: { question, businessId: context.businessId, conversationId: context.conversationId },
    });
    if (error) throw new AppError('unknown', 'The AI service is not available.', { cause: error });
    const parsed = answerSchema.safeParse(data);
    if (!parsed.success) throw new AppError('unknown', 'The AI service returned an unexpected answer.', { cause: parsed.error });
    return { ...parsed.data, source: 'ai' };
  }
}

// Whatever happens to the AI service, the user still gets a grounded answer.
export class FallbackAssistantGateway implements AssistantGateway {
  constructor(
    private readonly primary: AssistantGateway,
    private readonly fallback: AssistantGateway,
  ) {}

  async answer(question: string, context: AssistantContext): Promise<AssistantAnswer> {
    try {
      return await this.primary.answer(question, context);
    } catch {
      return this.fallback.answer(question, context);
    }
  }
}
