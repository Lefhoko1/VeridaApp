import { createDependencies } from '@/core/di/createDependencies';

import type { PlanAdvisor, PlanLinkSource, PlanOutbox } from '../domain/assist';
import type { PlanRepository } from '../domain/repositories';

export type PlanDependencies = {
  plan: PlanRepository;
  // Section 4.6: drafts suggestions through the AI service, or the built-in rules.
  advisor: PlanAdvisor;
  // Section 8: task changes made without a connection, waiting on this device.
  outbox: PlanOutbox;
  // Section 4.3: records a task can point at, from the records and operations modules.
  links: PlanLinkSource;
};

export const { Provider: PlanDependenciesProvider, useDependencies: usePlanDependencies } = createDependencies<PlanDependencies>('Plan');
