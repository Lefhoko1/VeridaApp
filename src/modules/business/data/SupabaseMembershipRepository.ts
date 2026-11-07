import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, parseRows } from '@/core/supabase/response';

import type { AssignableRole, Member, MemberPermission, ReceivedInvitation, SentInvitation } from '../domain/models';
import type { MembershipRepository } from '../domain/repositories';

const assignableRole = z.enum(['manager', 'staff', 'viewer']);

const memberSchema = z
  .object({
    user_id: z.string(),
    full_name: z.string(),
    email: z.string(),
    role: z.enum(['owner', 'manager', 'staff', 'viewer']),
    joined_at: z.string(),
  })
  .transform(
    (row): Member => ({
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      joinedAt: row.joined_at,
    }),
  );

const permissionSchema = z
  .object({ permission: z.string(), description: z.string(), from_role: z.boolean(), override: z.boolean().nullable(), allowed: z.boolean() })
  .transform((row): MemberPermission => ({ code: row.permission, description: row.description, fromRole: row.from_role, override: row.override, allowed: row.allowed }));

const sentSchema = z
  .object({ id: z.string(), email: z.string(), role: assignableRole, expires_at: z.string() })
  .transform((row): SentInvitation => ({ id: row.id, email: row.email, role: row.role, expiresAt: row.expires_at }));

const receivedSchema = z
  .object({ id: z.string(), business_name: z.string(), role: assignableRole, expires_at: z.string() })
  .transform(
    (row): ReceivedInvitation => ({
      id: row.id,
      businessName: row.business_name,
      role: row.role,
      expiresAt: row.expires_at,
    }),
  );

export class SupabaseMembershipRepository implements MembershipRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('business');
  }

  async listMembers(businessId: string): Promise<Member[]> {
    return parseRows(memberSchema, await this.db.rpc('list_members', { p_business_id: businessId }));
  }

  async listSentInvitations(businessId: string): Promise<SentInvitation[]> {
    return parseRows(
      sentSchema,
      await this.db
        .from('invitations')
        .select('id, email, role, expires_at')
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    );
  }

  async listReceivedInvitations(): Promise<ReceivedInvitation[]> {
    return parseRows(receivedSchema, await this.db.rpc('my_invitations'));
  }

  async invite(businessId: string, email: string, role: AssignableRole): Promise<void> {
    assertSuccess(await this.db.rpc('invite_member', { p_business_id: businessId, p_email: email, p_role: role }));
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    assertSuccess(await this.db.rpc('revoke_invitation', { p_invitation_id: invitationId }));
  }

  async respondToInvitation(invitationId: string, accept: boolean): Promise<void> {
    assertSuccess(await this.db.rpc('respond_to_invitation', { p_invitation_id: invitationId, p_accept: accept }));
  }

  async changeRole(businessId: string, userId: string, role: AssignableRole): Promise<void> {
    assertSuccess(await this.db.rpc('change_member_role', { p_business_id: businessId, p_user_id: userId, p_role: role }));
  }

  async removeMember(businessId: string, userId: string): Promise<void> {
    assertSuccess(await this.db.rpc('remove_member', { p_business_id: businessId, p_user_id: userId }));
  }

  async memberPermissions(businessId: string, userId: string): Promise<MemberPermission[]> {
    return parseRows(permissionSchema, await this.db.rpc('member_permissions', { p_business_id: businessId, p_user_id: userId }));
  }

  async setMemberPermission(businessId: string, userId: string, permission: string, allowed: boolean | null): Promise<void> {
    assertSuccess(await this.db.rpc('set_member_permission', { p_business_id: businessId, p_user_id: userId, p_permission: permission, p_allowed: allowed }));
  }

  async transferOwnership(businessId: string, userId: string): Promise<void> {
    assertSuccess(await this.db.rpc('transfer_ownership', { p_business_id: businessId, p_user_id: userId }));
  }
}
