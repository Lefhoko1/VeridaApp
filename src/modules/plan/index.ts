import type { SupabaseClient } from '@/core/supabase/client';

import { SupabasePlanRepository } from './data/SupabasePlanRepository';
import type { PlanDependencies } from './presentation/di';

export function createPlanDependencies(client: SupabaseClient): PlanDependencies {
  return { plan: new SupabasePlanRepository(client) };
}

export { PlanDependenciesProvider } from './presentation/di';
export { GoalFormScreen, GoalProfileScreen, PlanScreen, TaskFormScreen, TaskProfileScreen } from './presentation/views/planScreens';
