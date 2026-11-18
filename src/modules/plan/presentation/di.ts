import { createDependencies } from '@/core/di/createDependencies';

import type { PlanRepository } from '../domain/repositories';

export type PlanDependencies = {
  plan: PlanRepository;
};

export const { Provider: PlanDependenciesProvider, useDependencies: usePlanDependencies } = createDependencies<PlanDependencies>('Plan');
