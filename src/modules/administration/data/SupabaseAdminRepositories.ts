import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { mapProviderError } from '@/core/supabase/mapError';
import { assertSuccess, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { AdminBusiness, AdminBusinessDetail, AdminMember, AdminUser, AdminUserDetail, BusinessConfiguration, BusinessFilter, DeletionKind, DeletionRequest, PermissionMatrix, PersonPermission, PlatformPermission, PlatformRole, RoleAssignment, StaffRoleMatrix, UserFilter } from '../domain/models';
import type { BusinessAdminRepository, DeletionRepository, RoleRepository, UserAdminRepository } from '../domain/repositories';

const accountStatus = z.enum(['pending_verification', 'active', 'suspended', 'deactivated', 'deletion_requested', 'erased']);
const businessStatus = z.enum(['active', 'deactivated', 'suspended', 'deletion_requested']);
const platformRole = z.enum(['administrator', 'learning_reviewer', 'support']);
const platformPermission = z.enum(['users.manage', 'businesses.manage', 'configuration.manage', 'content.manage', 'lessons.review', 'monitoring.view', 'audit.view', 'ai_logs.view', 'deletions.process', 'roles.manage']);

const personPermissionSchema = z
  .object({ permission: z.string(), description: z.string(), from_role: z.boolean(), override: z.boolean().nullable(), allowed: z.boolean() })
  .transform((row): PersonPermission => ({ code: row.permission, description: row.description, fromRole: row.from_role, override: row.override, allowed: row.allowed }));

const adminMemberSchema = z
  .object({ user_id: z.string(), full_name: z.string(), email: z.string(), role: z.enum(['owner', 'manager', 'staff', 'viewer']) })
  .transform((row): AdminMember => ({ userId: row.user_id, fullName: row.full_name, email: row.email, role: row.role }));

const userFields = {
  id: z.string(),
  full_name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  account_status: accountStatus,
  created_at: z.string(),
};

const toUser = (row: { id: string; full_name: string; email: string; phone: string | null; account_status: AdminUser['accountStatus']; created_at: string }): AdminUser => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  accountStatus: row.account_status,
  createdAt: row.created_at,
});

const userSchema = z.object(userFields).transform(toUser);

const userDetailSchema = z
  .object({
    ...userFields,
    email_confirmed: z.boolean(),
    last_sign_in_at: z.string().nullable(),
    platform_roles: z.array(z.string()),
    business_count: numeric,
  })
  .transform(
    (row): AdminUserDetail => ({
      ...toUser(row),
      emailConfirmed: row.email_confirmed,
      lastSignInAt: row.last_sign_in_at,
      platformRoles: row.platform_roles,
      businessCount: row.business_count,
    }),
  );

export class SupabaseUserAdminRepository implements UserAdminRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('identity');
  }

  async search(filter: UserFilter): Promise<AdminUser[]> {
    return parseRows(
      userSchema,
      await this.db.rpc('admin_search_users', {
        p_query: filter.query || null,
        p_status: filter.status || null,
        p_from: filter.from || null,
        p_to: filter.to || null,
      }),
    );
  }

  async get(id: string): Promise<AdminUserDetail> {
    return parseRow(userDetailSchema, await this.db.rpc('admin_get_user', { p_id: id }).single());
  }

  async update(id: string, input: { fullName: string; phone: string | null }): Promise<void> {
    assertSuccess(await this.db.rpc('admin_update_user', { p_id: id, p_full_name: input.fullName, p_phone: input.phone }));
  }

  async setStatus(id: string, status: 'active' | 'suspended'): Promise<void> {
    assertSuccess(await this.db.rpc('admin_set_user_status', { p_id: id, p_status: status }));
  }

  async initiateDeletion(id: string): Promise<void> {
    assertSuccess(await this.db.rpc('admin_initiate_deletion', { p_id: id }));
  }
}

const businessFields = {
  id: z.string(),
  name: z.string(),
  industry_code: z.string(),
  location: z.string().nullable(),
  country: z.string(),
  status: businessStatus,
  owner_email: z.string().nullable(),
  member_count: numeric,
  created_at: z.string(),
};

const toBusiness = (row: { id: string; name: string; industry_code: string; location: string | null; country: string; status: AdminBusiness['status']; owner_email: string | null; member_count: number; created_at: string }): AdminBusiness => ({
  id: row.id,
  name: row.name,
  industryCode: row.industry_code,
  location: row.location,
  country: row.country,
  status: row.status,
  ownerEmail: row.owner_email,
  memberCount: row.member_count,
  createdAt: row.created_at,
});

const businessSchema = z.object(businessFields).transform(toBusiness);

const businessDetailSchema = z
  .object({ ...businessFields, stage: z.string(), size: z.string(), currency: z.string(), main_goal: z.string().nullable() })
  .transform((row): AdminBusinessDetail => ({ ...toBusiness(row), stage: row.stage, size: row.size, currency: row.currency, mainGoal: row.main_goal }));

export class SupabaseBusinessAdminRepository implements BusinessAdminRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('business');
  }

  async search(filter: BusinessFilter): Promise<AdminBusiness[]> {
    return parseRows(
      businessSchema,
      await this.db.rpc('admin_search_businesses', {
        p_query: filter.query || null,
        p_industry: filter.industry || null,
        p_location: filter.location || null,
        p_status: filter.status || null,
      }),
    );
  }

  async get(id: string): Promise<AdminBusinessDetail> {
    return parseRow(businessDetailSchema, await this.db.rpc('admin_get_business', { p_id: id }).single());
  }

  async updateConfiguration(id: string, configuration: BusinessConfiguration): Promise<void> {
    assertSuccess(
      await this.db.rpc('admin_update_configuration', {
        p_id: id,
        p_industry_code: configuration.industryCode,
        p_stage: configuration.stage,
        p_size: configuration.size,
        p_currency: configuration.currency,
      }),
    );
  }

  async setStatus(id: string, status: 'active' | 'suspended'): Promise<void> {
    assertSuccess(await this.db.rpc('admin_set_status', { p_id: id, p_status: status }));
  }

  async initiateDeletion(id: string): Promise<void> {
    assertSuccess(await this.db.rpc('admin_initiate_deletion', { p_id: id }));
  }

  async listMembers(id: string): Promise<AdminMember[]> {
    return parseRows(adminMemberSchema, await this.db.rpc('admin_list_members', { p_business_id: id }));
  }

  async changeMemberRole(id: string, userId: string, role: string): Promise<void> {
    assertSuccess(await this.db.rpc('admin_change_member_role', { p_business_id: id, p_user_id: userId, p_role: role }));
  }

  async removeMember(id: string, userId: string): Promise<void> {
    assertSuccess(await this.db.rpc('admin_remove_member', { p_business_id: id, p_user_id: userId }));
  }

  async transferOwnership(id: string, userId: string): Promise<void> {
    assertSuccess(await this.db.rpc('admin_transfer_ownership', { p_business_id: id, p_user_id: userId }));
  }

  async memberPermissions(id: string, userId: string): Promise<PersonPermission[]> {
    return parseRows(personPermissionSchema, await this.db.rpc('admin_member_permissions', { p_business_id: id, p_user_id: userId }));
  }

  async setMemberPermission(id: string, userId: string, permission: string, allowed: boolean | null): Promise<void> {
    assertSuccess(await this.db.rpc('admin_set_member_permission', { p_business_id: id, p_user_id: userId, p_permission: permission, p_allowed: allowed }));
  }
}

const deletionSchema = z
  .object({ kind: z.enum(['account', 'business', 'learner_profile']), id: z.string(), name: z.string(), detail: z.string().nullable(), requested_at: z.string(), erasable_from: z.string() })
  .transform((row): DeletionRequest => ({ kind: row.kind, id: row.id, name: row.name, detail: row.detail, requestedAt: row.requested_at, erasableFrom: row.erasable_from }));

// One queue, but each kind of data is erased by the module that owns it.
const ERASE: Record<DeletionKind, { schema: 'identity' | 'business' | 'learning'; erase: string; cancel: string; argument: string }> = {
  account: { schema: 'identity', erase: 'admin_erase_account', cancel: 'admin_cancel_deletion', argument: 'p_id' },
  business: { schema: 'business', erase: 'admin_erase_business', cancel: 'admin_cancel_deletion', argument: 'p_id' },
  learner_profile: { schema: 'learning', erase: 'admin_erase_learner_profile', cancel: 'admin_restore_learner_profile', argument: 'p_user' },
};

export class SupabaseDeletionRepository implements DeletionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async queue(): Promise<DeletionRequest[]> {
    return parseRows(deletionSchema, await this.client.schema('platform').rpc('admin_deletion_queue'));
  }

  async retentionDays(): Promise<number> {
    return parseRow(numeric, await this.client.schema('platform').rpc('admin_get_retention').single());
  }

  async setRetentionDays(days: number): Promise<void> {
    assertSuccess(await this.client.schema('platform').rpc('admin_set_retention', { p_days: days }));
  }

  async erase(request: DeletionRequest): Promise<void> {
    const target = ERASE[request.kind];
    // A business's receipts, photos and logo go first. Storage files can only be removed through
    // the storage service, and once the business is gone nobody could reach them.
    if (request.kind === 'business') await this.removeBusinessFiles(request.id);
    assertSuccess(await this.client.schema(target.schema).rpc(target.erase, { [target.argument]: request.id }));
  }

  private async removeBusinessFiles(businessId: string): Promise<void> {
    const bucket = this.client.storage.from('business-files');
    for (const folder of ['receipts', 'products', 'logo']) {
      for (;;) {
        const { data, error } = await bucket.list(`${businessId}/${folder}`, { limit: 100 });
        // "Not found" means there is nothing stored there, which is nothing to remove.
        if (error && 'status' in error && error.status === 404) break;
        if (error) throw mapProviderError(error);
        const paths = (data ?? []).map((item) => `${businessId}/${folder}/${item.name}`);
        if (paths.length === 0) break;
        const removed = await bucket.remove(paths);
        if (removed.error) throw mapProviderError(removed.error);
      }
    }
  }

  async cancel(request: DeletionRequest): Promise<void> {
    const target = ERASE[request.kind];
    assertSuccess(await this.client.schema(target.schema).rpc(target.cancel, { [target.argument]: request.id }));
  }
}

const assignmentSchema = z
  .object({ user_id: z.string(), full_name: z.string(), email: z.string(), role: platformRole, granted_at: z.string() })
  .transform((row): RoleAssignment => ({ userId: row.user_id, fullName: row.full_name, email: row.email, role: row.role, grantedAt: row.granted_at }));

export class SupabaseRoleRepository implements RoleRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('authz');
  }

  async myRoles(): Promise<PlatformRole[]> {
    return parseRows(platformRole, await this.db.rpc('my_platform_roles'));
  }

  async myPermissions(): Promise<PlatformPermission[]> {
    return parseRows(platformPermission, await this.db.rpc('my_platform_permissions'));
  }

  async listAssignments(): Promise<RoleAssignment[]> {
    return parseRows(assignmentSchema, await this.db.rpc('admin_list_platform_roles'));
  }

  async grant(email: string, role: PlatformRole): Promise<void> {
    assertSuccess(await this.db.rpc('admin_grant_platform_role', { p_email: email, p_role: role }));
  }

  async revoke(userId: string, role: PlatformRole): Promise<void> {
    assertSuccess(await this.db.rpc('admin_revoke_platform_role', { p_user_id: userId, p_role: role }));
  }

  async permissionMatrix(): Promise<PermissionMatrix> {
    const [roles, permissions, granted] = await Promise.all([
      this.db.from('business_roles').select('code, name'),
      this.db.from('permissions').select('code, description').order('code'),
      this.db.from('role_permissions').select('role, permission'),
    ]);
    return {
      roles: parseRows(z.object({ code: z.string(), name: z.string() }), roles),
      permissions: parseRows(z.object({ code: z.string(), description: z.string() }), permissions),
      granted: parseRows(z.object({ role: z.string(), permission: z.string() }), granted),
    };
  }

  async setRolePermission(role: string, permission: string, allowed: boolean): Promise<void> {
    assertSuccess(await this.db.rpc('admin_set_role_permission', { p_role: role, p_permission: permission, p_allowed: allowed }));
  }

  async staffRoleMatrix(): Promise<StaffRoleMatrix> {
    const [permissions, granted] = await Promise.all([
      this.db.from('platform_permissions').select('code, description').order('code'),
      this.db.from('platform_role_permissions').select('role, permission'),
    ]);
    return {
      permissions: parseRows(z.object({ code: z.string(), description: z.string() }), permissions),
      granted: parseRows(z.object({ role: z.string(), permission: z.string() }), granted),
    };
  }

  async setStaffRolePermission(role: string, permission: string, allowed: boolean): Promise<void> {
    assertSuccess(await this.db.rpc('admin_set_platform_role_permission', { p_role: role, p_permission: permission, p_allowed: allowed }));
  }

  async staffPermissions(userId: string): Promise<PersonPermission[]> {
    return parseRows(personPermissionSchema, await this.db.rpc('admin_staff_permissions', { p_user_id: userId }));
  }

  async setStaffPermission(userId: string, permission: string, allowed: boolean | null): Promise<void> {
    assertSuccess(await this.db.rpc('admin_set_staff_permission', { p_user_id: userId, p_permission: permission, p_allowed: allowed }));
  }
}
