import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, parseRow } from '@/core/supabase/response';

import type { UserProfile } from '../domain/models';
import type { ProfileRepository } from '../domain/repositories';

const COLUMNS = 'id, full_name, email, phone, account_status, created_at';

const rowSchema = z
  .object({
    id: z.string(),
    full_name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    account_status: z.enum(['pending_verification', 'active', 'suspended', 'deactivated', 'deletion_requested']),
    created_at: z.string(),
  })
  .transform(
    (row): UserProfile => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      accountStatus: row.account_status,
      createdAt: row.created_at,
    }),
  );

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('identity');
  }

  async getProfile(userId: string): Promise<UserProfile> {
    return parseRow(rowSchema, await this.db.from('profiles').select(COLUMNS).eq('id', userId).single());
  }

  async updateProfile(userId: string, input: { fullName: string; phone: string | null }): Promise<UserProfile> {
    return parseRow(
      rowSchema,
      await this.db
        .from('profiles')
        .update({ full_name: input.fullName, phone: input.phone })
        .eq('id', userId)
        .select(COLUMNS)
        .single(),
    );
  }

  async deactivateAccount(): Promise<void> {
    assertSuccess(await this.db.rpc('deactivate_account'));
  }

  async requestAccountDeletion(): Promise<void> {
    assertSuccess(await this.db.rpc('request_account_deletion'));
  }
}
