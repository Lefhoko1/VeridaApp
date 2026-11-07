import type { SupabaseClient } from '@/core/supabase/client';

import { SupabaseAnalyticsRepository } from './data/SupabaseAnalyticsRepository';
import type { AnalyticsDependencies } from './presentation/di';

export function createAnalyticsDependencies(client: SupabaseClient): AnalyticsDependencies {
  return { analytics: new SupabaseAnalyticsRepository(client) };
}

export type { Kpi } from './domain/models';
export type { AnalyticsRepository } from './domain/repositories';
export { AnalyticsDependenciesProvider } from './presentation/di';
export { DashboardScreen } from './presentation/views/DashboardScreen';
export { InsightsScreen } from './presentation/views/InsightsScreen';
