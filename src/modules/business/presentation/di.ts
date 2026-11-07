import { createDependencies } from '@/core/di/createDependencies';

import type { ActiveBusinessStore, BusinessRepository, MembershipRepository } from '../domain/repositories';

export type BusinessDependencies = {
  businesses: BusinessRepository;
  memberships: MembershipRepository;
  activeBusinessStore: ActiveBusinessStore;
};

export const { Provider: BusinessDependenciesProvider, useDependencies: useBusinessDependencies } =
  createDependencies<BusinessDependencies>('Business');
