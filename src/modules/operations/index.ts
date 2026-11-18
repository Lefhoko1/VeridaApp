import type { BusinessFileStore } from '@/core/files/types';
import type { SupabaseClient } from '@/core/supabase/client';

import { SupabaseActivityRepository } from './data/SupabaseActivityRepository';
import { SupabaseFlockRepository } from './data/SupabaseFlockRepository';
import type { RelatedRecordsSource } from './domain/models';
import type { OperationsDependencies } from './presentation/di';

export function createOperationsDependencies(client: SupabaseClient, files: BusinessFileStore, related: RelatedRecordsSource): OperationsDependencies {
  return {
    activities: new SupabaseActivityRepository(client),
    flocks: new SupabaseFlockRepository(client),
    files,
    related,
  };
}

export type { RelatedOption, RelatedRecordsSource } from './domain/models';
export { OperationsDependenciesProvider } from './presentation/di';
export { ActivityProfileScreen, FlockProfileScreen } from './presentation/views/operationsProfiles';
export { ActivityFormScreen, ActivityList, FlockFormScreen, FlockListScreen, ImportActivityScreen } from './presentation/views/operationsScreens';
export { ActivitySettingsScreen } from './presentation/views/activityFields';
