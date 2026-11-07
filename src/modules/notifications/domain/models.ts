export type NotificationType = 'account' | 'invitation' | 'lesson' | 'reminder' | 'platform' | 'business';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

export type NotificationPreferences = {
  lessonPublished: boolean;
  learningReminders: boolean;
  businessUpdates: boolean;
  emailEnabled: boolean;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  lessonPublished: true,
  learningReminders: true,
  businessUpdates: true,
  emailEnabled: true,
};

export interface NotificationRepository {
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  remove(id: string): Promise<void>;
  getPreferences(): Promise<NotificationPreferences>;
  savePreferences(preferences: NotificationPreferences): Promise<void>;
}
