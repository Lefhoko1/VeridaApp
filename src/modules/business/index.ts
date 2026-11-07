import { deviceStore } from '@/core/storage/keyValueStore';
import type { SupabaseClient } from '@/core/supabase/client';

import { DeviceActiveBusinessStore, SupabaseBusinessRepository } from './data/SupabaseBusinessRepository';
import { SupabaseMembershipRepository } from './data/SupabaseMembershipRepository';
import type { BusinessDependencies } from './presentation/di';

export function createBusinessDependencies(client: SupabaseClient): BusinessDependencies {
  return {
    businesses: new SupabaseBusinessRepository(client),
    memberships: new SupabaseMembershipRepository(client),
    activeBusinessStore: new DeviceActiveBusinessStore(deviceStore),
  };
}

export { industriesOf } from './domain/models';
export type { Industry, Permission, Workspace } from './domain/models';
export { BusinessDependenciesProvider } from './presentation/di';
export { ActiveBusinessProvider, useActiveBusiness, useBusinessContext, type ActiveBusiness } from './presentation/viewmodels/useActiveBusiness';
export { BusinessProfileScreen, ChangeHistoryScreen, MemberPermissionsScreen, MembersScreen } from './presentation/views/businessScreens';
export { BusinessSetupScreen } from './presentation/views/BusinessSetupScreen';
