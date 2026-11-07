import type { SupabaseClient } from '@/core/supabase/client';

import { SupabaseBusinessAdminRepository, SupabaseDeletionRepository, SupabaseRoleRepository, SupabaseUserAdminRepository } from './data/SupabaseAdminRepositories';
import { SupabaseIndustryConfigRepository } from './data/SupabaseIndustryConfigRepository';
import { SupabaseMonitoringRepository } from './data/SupabaseMonitoringRepository';
import type { AdministrationDependencies } from './presentation/di';

export function createAdministrationDependencies(client: SupabaseClient): AdministrationDependencies {
  return {
    users: new SupabaseUserAdminRepository(client),
    businesses: new SupabaseBusinessAdminRepository(client),
    industries: new SupabaseIndustryConfigRepository(client),
    roles: new SupabaseRoleRepository(client),
    deletions: new SupabaseDeletionRepository(client),
    monitoring: new SupabaseMonitoringRepository(client),
  };
}

export { AdministrationDependenciesProvider } from './presentation/di';
export { usePlatformAccess } from './presentation/viewmodels/usePlatformAccess';
export { TeamAccessScreen } from './presentation/views/TeamAccessScreen';
export { AiLogsScreen, AuditScreen, DeletionQueueScreen, MonitoringScreen, PlatformHubScreen, RolesScreen, StaffPermissionsScreen } from './presentation/views/governanceScreens';
export { IndustryDetailScreen, IndustryListScreen, KpiFormScreen } from './presentation/views/industryScreens';
export { BusinessDetailScreen, BusinessListScreen, BusinessMemberPermissionsScreen, UserDetailScreen, UserListScreen } from './presentation/views/peopleScreens';
