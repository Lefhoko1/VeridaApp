import { createDependencies } from '@/core/di/createDependencies';

import type { NotificationRepository } from '../domain/models';

export type NotificationsDependencies = {
  notifications: NotificationRepository;
};

export const { Provider: NotificationsDependenciesProvider, useDependencies: useNotificationsDependencies } =
  createDependencies<NotificationsDependencies>('Notifications');
