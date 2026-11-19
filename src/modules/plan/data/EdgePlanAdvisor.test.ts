import type { SupabaseClient } from '@/core/supabase/client';

import type { PlanRepository } from '../domain/repositories';
import { EdgePlanAdvisor } from './EdgePlanAdvisor';

function setup(invoke: jest.Mock) {
  const client = { functions: { invoke } } as unknown as SupabaseClient;
  const plan = { suggestFromRules: jest.fn(async () => 'rules-1') } as unknown as PlanRepository & { suggestFromRules: jest.Mock };
  return { advisor: new EdgePlanAdvisor(client, plan), plan };
}

describe('EdgePlanAdvisor (Plan section 4.6)', () => {
  it('uses the AI service when it answers', async () => {
    const invoke = jest.fn(async () => ({ data: { recommendationId: 'ai-1' }, error: null }));
    const { advisor, plan } = setup(invoke);
    expect(await advisor.suggest({ businessId: 'b', kind: 'goal_breakdown', goalId: 'g' })).toEqual({ suggestionId: 'ai-1', source: 'ai' });
    expect(invoke).toHaveBeenCalledWith('plan-assist', { body: { businessId: 'b', kind: 'goal_breakdown', goalId: 'g', request: null } });
    expect(plan.suggestFromRules).not.toHaveBeenCalled();
  });

  it('falls back to the built-in rules when the AI is unavailable, and says so', async () => {
    const invoke = jest.fn(async () => ({ data: null, error: { context: { status: 503 } } }));
    const { advisor, plan } = setup(invoke);
    expect(await advisor.suggest({ businessId: 'b', kind: 'weekly_plan', request: 'free mornings' })).toEqual({ suggestionId: 'rules-1', source: 'rules' });
    expect(plan.suggestFromRules).toHaveBeenCalledWith('b', 'weekly_plan', null, 'free mornings');
  });

  it('does not retry with the rules when the person may not plan', async () => {
    const invoke = jest.fn(async () => ({ data: null, error: { context: { status: 403 } } }));
    const { advisor, plan } = setup(invoke);
    await expect(advisor.suggest({ businessId: 'b', kind: 'weekly_plan' })).rejects.toMatchObject({ code: 'forbidden' });
    expect(plan.suggestFromRules).not.toHaveBeenCalled();
  });
});
