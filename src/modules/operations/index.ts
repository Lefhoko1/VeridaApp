import type { BusinessFileStore } from '@/core/files/types';
import type { SupabaseClient } from '@/core/supabase/client';

import { SupabaseActivityRepository } from './data/SupabaseActivityRepository';
import { SupabaseFlockRepository } from './data/SupabaseFlockRepository';
import type { OperationsDependencies } from './presentation/di';

export function createOperationsDependencies(client: SupabaseClient, files: BusinessFileStore): OperationsDependencies {
  return {
    activities: new SupabaseActivityRepository(client),
    flocks: new SupabaseFlockRepository(client),
    files,
  };
}

export { OperationsDependenciesProvider } from './presentation/di';
export { ActivityProfileScreen, FlockProfileScreen } from './presentation/views/operationsProfiles';
export { ActivityFormScreen, ActivityList, FlockFormScreen, FlockListScreen, ImportActivityScreen } from './presentation/views/operationsScreens';
