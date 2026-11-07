import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, nullableNumeric, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { ActivityInput, ActivityRecord, ActivityType } from '../domain/models';
import type { ActivityRepository } from '../domain/repositories';

const LIST_LIMIT = 200;

const typeSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    description: z.string(),
    default_unit: z.string(),
    uses_flock: z.boolean(),
    allows_negative: z.boolean(),
    min_quantity: nullableNumeric,
    max_quantity: nullableNumeric,
    whole_numbers_only: z.boolean(),
    notes_required: z.boolean(),
    allowed_units: z.array(z.string()),
  })
  .transform(
    (row): ActivityType => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      defaultUnit: row.default_unit,
      usesFlock: row.uses_flock,
      allowsNegative: row.allows_negative,
      minQuantity: row.min_quantity,
      maxQuantity: row.max_quantity,
      wholeNumbersOnly: row.whole_numbers_only,
      notesRequired: row.notes_required,
      allowedUnits: row.allowed_units,
    }),
  );

const COLUMNS = 'id, activity_type_id, occurred_on, quantity, unit, flock_id, notes, status, void_reason';

const rowSchema = z.object({
  id: z.string(),
  activity_type_id: z.string(),
  occurred_on: z.string(),
  quantity: numeric,
  unit: z.string(),
  flock_id: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['recorded', 'voided']),
  void_reason: z.string().nullable(),
});

const toRow = (input: ActivityInput) => ({
  activity_type_id: input.activityTypeId,
  occurred_on: input.occurredOn,
  quantity: input.quantity,
  unit: input.unit,
  flock_id: input.flockId,
  notes: input.notes,
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
    };
  }

  async listTypes(industryCodes: string[]): Promise<ActivityType[]> {
    return parseRows(
      typeSchema,
      await this.client
        .schema('platform')
        .from('activity_types')
        .select('id, code, name, description, default_unit, uses_flock, allows_negative, min_quantity, max_quantity, whole_numbers_only, notes_required, allowed_units')
        .in('industry_code', industryCodes)
        .order('sort_order'),
    );
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
    assertSuccess(await this.db.from('activity_records').insert({ business_id: businessId, ...toRow(input) }));
  }

  async createMany(businessId: string, inputs: ActivityInput[]): Promise<void> {
    assertSuccess(await this.db.from('activity_records').insert(inputs.map((input) => ({ business_id: businessId, ...toRow(input) }))));
  }

  async update(id: string, input: ActivityInput): Promise<void> {
    assertSuccess(await this.db.from('activity_records').update(toRow(input)).eq('id', id));
  }

  async void(id: string, reason: string): Promise<void> {
    assertSuccess(await this.db.rpc('void_activity', { p_id: id, p_reason: reason }));
  }
}
