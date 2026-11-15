import { createDependencies } from '@/core/di/createDependencies';
import type { BusinessFileStore } from '@/core/files/types';

import type { ActivityRepository, FlockRepository } from '../domain/repositories';

export type OperationsDependencies = {
  activities: ActivityRepository;
  flocks: FlockRepository;
  files: BusinessFileStore;
};

export const { Provider: OperationsDependenciesProvider, useDependencies: useOperationsDependencies } =
  createDependencies<OperationsDependencies>('Operations');
