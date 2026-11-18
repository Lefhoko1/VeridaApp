import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, nullableNumeric, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { ActivityField, ActivityInput, ActivityRecord, ActivityStatus, ActivityType } from '../domain/models';
import type { ActivityRepository } from '../domain/repositories';

const LIST_LIMIT = 200;

const fieldSchema = z
  .object({
    code: z.string(),
    label: z.string(),
    help: z.string(),
    data_type: z.enum(['text', 'integer', 'decimal', 'date', 'time', 'boolean', 'select', 'multi_select']),
    is_required: z.boolean(),
    unit: z.string().nullable(),
    options: z.array(z.string()),
    min_value: nullableNumeric,
    max_value: nullableNumeric,
  })
  .transform(
    (row): ActivityField => ({
      code: row.code,
      label: row.label,
      help: row.help,
      dataType: row.data_type,
      isRequired: row.is_required,
      unit: row.unit,
      options: row.options,
      minValue: row.min_value,
      maxValue: row.max_value,
    }),
  );

const typeSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    description: z.string(),
    group_code: z.string(),
    group_name: z.string(),
    default_unit: z.string(),
    quantity_mode: z.enum(['required', 'optional', 'none']),
    uses_flock: z.boolean(),
    allows_negative: z.boolean(),
    min_quantity: nullableNumeric,
    max_quantity: nullableNumeric,
    whole_numbers_only: z.boolean(),
    notes_required: z.boolean(),
    allowed_units: z.array(z.string()),
    is_enabled: z.boolean(),
    enabled_by_default: z.boolean(),
    fields: z.array(fieldSchema),
  })
  .transform(
    (row): ActivityType => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      groupCode: row.group_code,
      groupName: row.group_name,
      defaultUnit: row.default_unit,
      quantityMode: row.quantity_mode,
      usesFlock: row.uses_flock,
      allowsNegative: row.allows_negative,
      minQuantity: row.min_quantity,
      maxQuantity: row.max_quantity,
      wholeNumbersOnly: row.whole_numbers_only,
      notesRequired: row.notes_required,
      allowedUnits: row.allowed_units,
      isEnabled: row.is_enabled,
      enabledByDefault: row.enabled_by_default,
      fields: row.fields,
    }),
  );

const COLUMNS =
  'id, activity_type_id, occurred_on, quantity, unit, flock_id, notes, status, void_reason, receipt_paths, details, form_version, responsible_user_id, sale_id, expense_id, product_id';

const detailValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

const rowSchema = z.object({
  id: z.string(),
  activity_type_id: z.string(),
  occurred_on: z.string(),
  quantity: nullableNumeric,
  unit: z.string().nullable(),
  flock_id: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['planned', 'in_progress', 'recorded', 'requires_review', 'cancelled', 'voided']),
  void_reason: z.string().nullable(),
  receipt_paths: z.array(z.string()).default([]),
  details: z.record(z.string(), detailValue).default({}),
  form_version: z.number().nullable().default(null),
  responsible_user_id: z.string().nullable().default(null),
  sale_id: z.string().nullable().default(null),
  expense_id: z.string().nullable().default(null),
  product_id: z.string().nullable().default(null),
});

// Optional parts are sent only when given, so an import leaves them as they are.
const toRow = (input: ActivityInput) => ({
  activity_type_id: input.activityTypeId,
  occurred_on: input.occurredOn,
  quantity: input.quantity,
  unit: input.unit,
  flock_id: input.flockId,
  notes: input.notes,
  ...(input.receiptPaths !== undefined ? { receipt_paths: input.receiptPaths } : {}),
  ...(input.details !== undefined ? { details: input.details } : {}),
  ...(input.responsibleUserId !== undefined ? { responsible_user_id: input.responsibleUserId } : {}),
  ...(input.saleId !== undefined ? { sale_id: input.saleId } : {}),
  ...(input.expenseId !== undefined ? { expense_id: input.expenseId } : {}),
  ...(input.productId !== undefined ? { product_id: input.productId } : {}),
});

const toNewRow = (businessId: string, input: ActivityInput) => ({
  business_id: businessId,
  ...toRow(input),
  ...(input.status !== undefined ? { status: input.status } : {}),
});

export class SupabaseActivityRepository implements ActivityRepository {
  // Activity names live in platform configuration, in another schema that PostgREST cannot
  // embed, so they are resolved here. Names barely change, so one lookup is cached per client.
  private typeNames: Promise<Map<string, string>> | null = null;

  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('operations');
  }

  private namesById(): Promise<Map<string, string>> {
    this.typeNames ??= (async () => {
      const rows = parseRows(
        z.object({ id: z.string(), name: z.string() }),
        await this.client.schema('platform').from('activity_types').select('id, name'),
      );
      return new Map(rows.map((row) => [row.id, row.name]));
    })().catch((error: unknown) => {
      this.typeNames = null;
      throw error;
    });
    return this.typeNames;
  }

  private toRecord(row: z.output<typeof rowSchema>, names: Map<string, string>): ActivityRecord {
    return {
      id: row.id,
      activityTypeId: row.activity_type_id,
      activityName: names.get(row.activity_type_id) ?? 'Activity',
      occurredOn: row.occurred_on,
      quantity: row.quantity,
      unit: row.unit,
      flockId: row.flock_id,
      notes: row.notes,
      status: row.status,
      voidReason: row.void_reason,
      receiptPaths: row.receipt_paths,
      details: row.details,
      formVersion: row.form_version,
      responsibleUserId: row.responsible_user_id,
      saleId: row.sale_id,
      expenseId: row.expense_id,
      productId: row.product_id,
    };
  }

  async listTypes(businessId: string): Promise<ActivityType[]> {
    return parseRows(typeSchema, await this.db.rpc('business_activity_types', { p_business_id: businessId }));
  }

  async setTypeEnabled(businessId: string, activityTypeId: string, enabled: boolean): Promise<void> {
    assertSuccess(await this.db.rpc('set_activity_type_enabled', { p_business_id: businessId, p_type_id: activityTypeId, p_enabled: enabled }));
  }

  async setStatus(id: string, status: Exclude<ActivityStatus, 'voided'>): Promise<void> {
    assertSuccess(await this.db.rpc('set_activity_status', { p_id: id, p_status: status }));
  }

  async list(businessId: string, filter: { search?: string; activityTypeId?: string; from?: string }): Promise<ActivityRecord[]> {
    let query = this.db.from('activity_records').select(COLUMNS).eq('business_id', businessId);
    if (filter.activityTypeId) query = query.eq('activity_type_id', filter.activityTypeId);
    if (filter.from) query = query.gte('occurred_on', filter.from);
    if (filter.search) query = query.ilike('notes', `%${filter.search.replace(/[%_]/g, ' ')}%`);
    const [rows, names] = await Promise.all([
      query.order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(LIST_LIMIT),
      this.namesById(),
    ]);
    return parseRows(rowSchema, rows).map((row) => this.toRecord(row, names));
  }

  async get(id: string): Promise<ActivityRecord> {
    const [row, names] = await Promise.all([
      this.db.from('activity_records').select(COLUMNS).eq('id', id).single(),
      this.namesById(),
    ]);
    return this.toRecord(parseRow(rowSchema, row), names);
  }

  async create(businessId: string, input: ActivityInput): Promise<void> {
    assertSuccess(await this.db.from('activity_records').insert(toNewRow(businessId, input)));
  }

  async createMany(businessId: string, inputs: ActivityInput[]): Promise<void> {
    assertSuccess(await this.db.from('activity_records').insert(inputs.map((input) => toNewRow(businessId, input))));
  }

  async update(id: string, input: ActivityInput): Promise<void> {
    assertSuccess(await this.db.from('activity_records').update(toRow(input)).eq('id', id));
  }

  async void(id: string, reason: string): Promise<void> {
    assertSuccess(await this.db.rpc('void_activity', { p_id: id, p_reason: reason }));
  }
}
