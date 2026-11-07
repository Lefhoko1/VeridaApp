import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, parseOptionalRow, parseRows } from '@/core/supabase/response';

import { DEFAULT_PREFERENCES, type AppNotification, type NotificationPreferences, type NotificationRepository } from '../domain/models';

const notificationSchema = z
  .object({
    id: z.string(),
    type: z.enum(['account', 'invitation', 'lesson', 'reminder', 'business', 'platform']),
    title: z.string(),
    body: z.string(),
    read_at: z.string().nullable(),
    created_at: z.string(),
  })
  .transform(
    (row): AppNotification => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      isRead: row.read_at !== null,
      createdAt: row.created_at,
    }),
  );

const preferencesSchema = z
  .object({ lesson_published: z.boolean(), learning_reminders: z.boolean(), business_updates: z.boolean(), email_enabled: z.boolean() })
  .transform(
    (row): NotificationPreferences => ({
      lessonPublished: row.lesson_published,
      learningReminders: row.learning_reminders,
      businessUpdates: row.business_updates,
      emailEnabled: row.email_enabled,
    }),
  );

const LIST_LIMIT = 100;

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('notifications');
  }

  async list(): Promise<AppNotification[]> {
    return parseRows(
      notificationSchema,
      await this.db.from('notifications').select('id, type, title, body, read_at, created_at').order('created_at', { ascending: false }).limit(LIST_LIMIT),
    );
  }

  async markRead(id: string): Promise<void> {
    assertSuccess(await this.db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id));
  }

  async markAllRead(): Promise<void> {
    assertSuccess(await this.db.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null));
  }

  async remove(id: string): Promise<void> {
    assertSuccess(await this.db.from('notifications').delete().eq('id', id));
  }

  async getPreferences(): Promise<NotificationPreferences> {
    const stored = parseOptionalRow(
      preferencesSchema,
      await this.db.from('preferences').select('lesson_published, learning_reminders, business_updates, email_enabled').maybeSingle(),
    );
    return stored ?? DEFAULT_PREFERENCES;
  }

  async savePreferences(preferences: NotificationPreferences): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) throw new AppError('unauthenticated', 'Your session has ended. Please sign in again.');
    assertSuccess(
      await this.db.from('preferences').upsert({
        user_id: data.session.user.id,
        lesson_published: preferences.lessonPublished,
        learning_reminders: preferences.learningReminders,
        business_updates: preferences.businessUpdates,
        email_enabled: preferences.emailEnabled,
        updated_at: new Date().toISOString(),
      }),
    );
  }
}
