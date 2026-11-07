import { createDependencies } from '@/core/di/createDependencies';

import type { BusinessAdminRepository, DeletionRepository, IndustryConfigRepository, MonitoringRepository, RoleRepository, UserAdminRepository } from '../domain/repositories';

export type AdministrationDependencies = {
  users: UserAdminRepository;
  businesses: BusinessAdminRepository;
  industries: IndustryConfigRepository;
  roles: RoleRepository;
  deletions: DeletionRepository;
  monitoring: MonitoringRepository;
};

export const { Provider: AdministrationDependenciesProvider, useDependencies: useAdministrationDependencies } =
  createDependencies<AdministrationDependencies>('Administration');
