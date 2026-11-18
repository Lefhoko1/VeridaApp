import { deviceStore } from '@/core/storage/keyValueStore';
import type { BusinessFileStore } from '@/core/files/types';
import type { SupabaseClient } from '@/core/supabase/client';

import { DeviceActiveBusinessStore, SupabaseBusinessRepository } from './data/SupabaseBusinessRepository';
import { SupabaseMembershipRepository } from './data/SupabaseMembershipRepository';
import type { BusinessDependencies } from './presentation/di';

export function createBusinessDependencies(client: SupabaseClient, files: BusinessFileStore): BusinessDependencies {
  return {
    businesses: new SupabaseBusinessRepository(client),
    memberships: new SupabaseMembershipRepository(client),
    activeBusinessStore: new DeviceActiveBusinessStore(deviceStore),
    files,
  };
}

export { industriesOf } from './domain/models';
export type { BusinessCategory, Industry, Permission, Workspace } from './domain/models';
export { BusinessDependenciesProvider } from './presentation/di';
export { ActiveBusinessProvider, useActiveBusiness, useBusinessContext, type ActiveBusiness } from './presentation/viewmodels/useActiveBusiness';
export { useBusinessLogoUrl } from './presentation/viewmodels/useBusinessProfileViewModel';
export { BusinessProfileScreen, ChangeHistoryScreen, MemberPermissionsScreen, MembersScreen } from './presentation/views/businessScreens';
export { BusinessSetupScreen } from './presentation/views/BusinessSetupScreen';
