import { createDependencies } from '@/core/di/createDependencies';

import type { AnalyticsRepository } from '../domain/repositories';

export type AnalyticsDependencies = {
  analytics: AnalyticsRepository;
};

export const { Provider: AnalyticsDependenciesProvider, useDependencies: useAnalyticsDependencies } =
  createDependencies<AnalyticsDependencies>('Analytics');
