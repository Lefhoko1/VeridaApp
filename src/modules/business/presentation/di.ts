import { createDependencies } from '@/core/di/createDependencies';
import type { BusinessFileStore } from '@/core/files/types';

import type { ActiveBusinessStore, BusinessRepository, MembershipRepository } from '../domain/repositories';

export type BusinessDependencies = {
  businesses: BusinessRepository;
  memberships: MembershipRepository;
  activeBusinessStore: ActiveBusinessStore;
  files: BusinessFileStore;
};

export const { Provider: BusinessDependenciesProvider, useDependencies: useBusinessDependencies } =
  createDependencies<BusinessDependencies>('Business');
