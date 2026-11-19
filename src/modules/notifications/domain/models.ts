export type NotificationType = 'account' | 'invitation' | 'lesson' | 'reminder' | 'platform' | 'business' | 'task';

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
  // Reminders people set on Plan tasks (Plan specification section 9).
  taskReminders: boolean;
  // Quiet hours as HH:MM, in the business's time zone. Task reminders wait until they end.
  quietStart: string | null;
  quietEnd: string | null;
};

export type ToggleablePreference = 'lessonPublished' | 'learningReminders' | 'businessUpdates' | 'emailEnabled' | 'taskReminders';

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  lessonPublished: true,
  learningReminders: true,
  businessUpdates: true,
  emailEnabled: true,
  taskReminders: true,
  quietStart: null,
  quietEnd: null,
};

export interface NotificationRepository {
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  remove(id: string): Promise<void>;
  getPreferences(): Promise<NotificationPreferences>;
  savePreferences(preferences: NotificationPreferences): Promise<void>;
}
