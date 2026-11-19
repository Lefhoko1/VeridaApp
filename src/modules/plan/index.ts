import type { BusinessFileStore } from '@/core/files/types';
import { deviceStore } from '@/core/storage/keyValueStore';
import type { SupabaseClient } from '@/core/supabase/client';

import { DevicePlanOutbox } from './data/DevicePlanOutbox';
import { EdgePlanAdvisor } from './data/EdgePlanAdvisor';
import { SupabasePlanRepository } from './data/SupabasePlanRepository';
import type { PlanLinkSource } from './domain/assist';
import type { PlanDependencies } from './presentation/di';

export function createPlanDependencies(client: SupabaseClient, links: PlanLinkSource, files: BusinessFileStore): PlanDependencies {
  const plan = new SupabasePlanRepository(client);
  return { plan, advisor: new EdgePlanAdvisor(client, plan), outbox: new DevicePlanOutbox(deviceStore), links, files };
}

export type { FocusInsight, LinkOption, PlanLinkSource } from './domain/assist';
export { PlanDependenciesProvider } from './presentation/di';
export { GoalFormScreen, GoalProfileScreen, PlanScreen, TaskFormScreen, TaskProfileScreen } from './presentation/views/planScreens';
export { EventFormScreen, EventProfileScreen, ReviewFormScreen, ReviewScreen, SeriesFormScreen, SeriesProfileScreen } from './presentation/views/scheduleScreens';
export { PlanAssistScreen, PlanSettingsScreen, SuggestionScreen } from './presentation/views/assistScreens';
