import type { SupabaseClient } from '@/core/supabase/client';

import { SupabaseNotificationRepository } from './data/SupabaseNotificationRepository';
import type { NotificationsDependencies } from './presentation/di';

export function createNotificationsDependencies(client: SupabaseClient): NotificationsDependencies {
  return { notifications: new SupabaseNotificationRepository(client) };
}

export { NotificationsDependenciesProvider } from './presentation/di';
export { NotificationBell, NotificationsScreen } from './presentation/views/notificationScreens';
