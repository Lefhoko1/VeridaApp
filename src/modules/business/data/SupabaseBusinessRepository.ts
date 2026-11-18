import { z } from 'zod';

import type { KeyValueStore } from '@/core/storage/keyValueStore';
import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, parseRow, parseRows } from '@/core/supabase/response';

import type { BusinessCategory, BusinessDetails, BusinessStatus, ChangeEntry, Industry, Permission, Workspace } from '../domain/models';
import type { ActiveBusinessStore, BusinessRepository } from '../domain/repositories';

const industrySchema = z
  .object({
    code: z.string(),
    category_code: z.string(),
    name: z.string(),
    short_name: z.string(),
    description: z.string(),
    icon: z.string(),
    chart_title: z.string(),
  })
  .transform(
    (row): Industry => ({
      code: row.code,
      categoryCode: row.category_code,
      name: row.name,
      shortName: row.short_name,
      description: row.description,
      icon: row.icon,
      chartTitle: row.chart_title,
    }),
  );

const categorySchema = z
  .object({ code: z.string(), name: z.string(), description: z.string(), icon: z.string() })
  .transform((row): BusinessCategory => row);

const workspaceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    industry_code: z.string(),
    stage: z.string(),
    size: z.string(),
    country: z.string(),
    location: z.string().nullable(),
    currency: z.string(),
    main_goal: z.string().nullable(),
    record_keeping: z.string().nullable(),
    status: z.enum(['active', 'deactivated', 'suspended', 'deletion_requested']),
    my_role: z.enum(['owner', 'manager', 'staff', 'viewer']),
    additional_industries: z.array(z.string()).default([]),
    other_type: z.string().nullable().default(null),
    logo_path: z.string().nullable().default(null),
  })
  .transform(
    (row): Workspace => ({
      id: row.id,
      name: row.name,
      industryCode: row.industry_code,
      stage: row.stage,
      size: row.size,
      country: row.country,
      location: row.location,
      currency: row.currency,
      mainGoal: row.main_goal,
      recordKeeping: row.record_keeping,
      additionalIndustries: row.additional_industries,
      otherType: row.other_type,
      status: row.status,
      myRole: row.my_role,
      logoPath: row.logo_path,
    }),
  );

const changeSchema = z
  .object({
    id: z.coerce.number(),
    occurred_at: z.string(),
    table_name: z.string(),
    action: z.enum(['INSERT', 'UPDATE', 'DELETE']),
    actor_name: z.string().nullable(),
    changed_fields: z.array(z.string()),
  })
  .transform(
    (row): ChangeEntry => ({
      id: row.id,
      occurredAt: row.occurred_at,
      tableName: row.table_name,
      action: row.action,
      actorName: row.actor_name,
      changedFields: row.changed_fields,
    }),
  );

const permissionSchema = z.string().transform((value) => value as Permission);
const registeredSchema = z.object({ id: z.string() });

export class SupabaseBusinessRepository implements BusinessRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('business');
  }

  async listCategories(): Promise<BusinessCategory[]> {
    return parseRows(
      categorySchema,
      await this.client.schema('platform').from('business_categories').select('code, name, description, icon').eq('is_active', true).order('sort_order'),
    );
  }

  // Only types that can be chosen: active, in an active category. The database applies the
  // same rule when a business is saved.
  async listIndustries(): Promise<Industry[]> {
    const [categories, industries] = await Promise.all([
      this.listCategories(),
      this.client
        .schema('platform')
        .from('industries')
        .select('code, category_code, name, short_name, description, icon, chart_title')
        .eq('is_active', true)
        .order('sort_order')
        .then((response) => parseRows(industrySchema, response)),
    ]);
    // Positions are counted within each category, so the categories' order comes first.
    const position = new Map(categories.map((category, index) => [category.code, index]));
    return industries
      .filter((industry) => position.has(industry.categoryCode))
      .map((industry, index) => ({ industry, index }))
      .sort((a, b) => (position.get(a.industry.categoryCode) ?? 0) - (position.get(b.industry.categoryCode) ?? 0) || a.index - b.index)
      .map(({ industry }) => industry);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return parseRows(workspaceSchema, await this.db.rpc('my_workspaces'));
  }

  async listPermissions(businessId: string): Promise<Permission[]> {
    return parseRows(
      permissionSchema,
      await this.client.schema('authz').rpc('my_business_permissions', { p_business_id: businessId }),
    );
  }

  async register(details: BusinessDetails): Promise<string> {
    const created = parseRow(
      registeredSchema,
      await this.db.rpc('register_business', {
        p_name: details.name,
        p_industry_code: details.industryCode,
        p_stage: details.stage,
        p_size: details.size,
        p_country: details.country,
        p_location: details.location,
        p_currency: details.currency,
        p_main_goal: details.mainGoal,
        p_record_keeping: details.recordKeeping,
        p_additional_industries: details.additionalIndustries,
        p_other_type: details.otherType,
      }),
    );
    return created.id;
  }

  async update(businessId: string, details: BusinessDetails): Promise<void> {
    assertSuccess(
      await this.db
        .from('businesses')
        .update({
          name: details.name,
          industry_code: details.industryCode,
          stage: details.stage,
          size: details.size,
          country: details.country,
          location: details.location,
          currency: details.currency,
          main_goal: details.mainGoal,
          record_keeping: details.recordKeeping,
          additional_industries: details.additionalIndustries,
          other_type: details.otherType,
        })
        .eq('id', businessId),
    );
  }

  async setLogo(businessId: string, logoPath: string | null): Promise<void> {
    assertSuccess(await this.db.from('businesses').update({ logo_path: logoPath }).eq('id', businessId));
  }

  async setStatus(businessId: string, status: Exclude<BusinessStatus, 'suspended'>): Promise<void> {
    assertSuccess(await this.db.rpc('set_business_status', { p_business_id: businessId, p_status: status }));
  }

  async changeHistory(businessId: string): Promise<ChangeEntry[]> {
    return parseRows(changeSchema, await this.db.rpc('change_history', { p_business_id: businessId }));
  }
}

const ACTIVE_BUSINESS_KEY = 'verida.active-business';

export class DeviceActiveBusinessStore implements ActiveBusinessStore {
  constructor(private readonly store: KeyValueStore) {}

  load(): Promise<string | null> {
    return this.store.getItem(ACTIVE_BUSINESS_KEY);
  }

  save(businessId: string): Promise<void> {
    return this.store.setItem(ACTIVE_BUSINESS_KEY, businessId);
  }
}
