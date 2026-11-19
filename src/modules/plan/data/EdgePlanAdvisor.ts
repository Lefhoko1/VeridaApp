import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import type { SupabaseClient } from '@/core/supabase/client';

import type { PlanAdvisor, SuggestionRequest, SuggestionResult } from '../domain/assist';
import type { PlanRepository } from '../domain/repositories';

const resultSchema = z.object({ recommendationId: z.string() });

// Section 4.6: asks the AI service first. If it is unavailable, unconfigured, over its hourly
// limit or its draft fails the checks, Verida's built-in rules suggest from the plan itself, so
// the person still gets something grounded and is told which it was.
export class EdgePlanAdvisor implements PlanAdvisor {
  constructor(
    private readonly client: SupabaseClient,
    private readonly plan: PlanRepository,
  ) {}

  async suggest(request: SuggestionRequest): Promise<SuggestionResult> {
    const { data, error } = await this.client.functions.invoke('plan-assist', {
      body: { businessId: request.businessId, kind: request.kind, goalId: request.goalId ?? null, request: request.request ?? null },
    });
    if (!error) {
      const parsed = resultSchema.safeParse(data);
      if (parsed.success) return { suggestionId: parsed.data.recommendationId, source: 'ai' };
    }
    // A refusal for lack of permission is the same answer from the rules, so it is not retried.
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 403) throw new AppError('forbidden', 'You do not have permission to plan for this business.');
    const id = await this.plan.suggestFromRules(request.businessId, request.kind, request.goalId ?? null, request.request ?? null);
    return { suggestionId: id, source: 'rules' };
  }
}
