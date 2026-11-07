import { createDependencies } from '@/core/di/createDependencies';

import type { ActivityRepository, FlockRepository } from '../domain/repositories';

export type OperationsDependencies = {
  activities: ActivityRepository;
  flocks: FlockRepository;
};

export const { Provider: OperationsDependenciesProvider, useDependencies: useOperationsDependencies } =
  createDependencies<OperationsDependencies>('Operations');
