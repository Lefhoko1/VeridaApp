import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, nullableNumeric, parseRow, parseRows } from '@/core/supabase/response';

import type { Flock, FlockInput } from '../domain/models';
import type { FlockRepository } from '../domain/repositories';

const COLUMNS = 'id, name, breed, acquired_on, initial_count, is_active';

const rowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    breed: z.string().nullable(),
    acquired_on: z.string().nullable(),
    initial_count: nullableNumeric,
    is_active: z.boolean(),
  })
  .transform(
    (row): Flock => ({
      id: row.id,
      name: row.name,
      breed: row.breed,
      acquiredOn: row.acquired_on,
      initialCount: row.initial_count,
      isActive: row.is_active,
    }),
  );

const toRow = (input: FlockInput) => ({
  name: input.name,
  breed: input.breed,
  acquired_on: input.acquiredOn,
  initial_count: input.initialCount,
});

export class SupabaseFlockRepository implements FlockRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('operations');
  }

  async list(businessId: string): Promise<Flock[]> {
    return parseRows(
      rowSchema,
      await this.db.from('flocks').select(COLUMNS).eq('business_id', businessId).order('is_active', { ascending: false }).order('name'),
    );
  }

  async get(id: string): Promise<Flock> {
    return parseRow(rowSchema, await this.db.from('flocks').select(COLUMNS).eq('id', id).single());
  }

  async create(businessId: string, input: FlockInput): Promise<void> {
    assertSuccess(await this.db.from('flocks').insert({ business_id: businessId, ...toRow(input) }));
  }

  async update(id: string, input: FlockInput): Promise<void> {
    assertSuccess(await this.db.from('flocks').update(toRow(input)).eq('id', id));
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    assertSuccess(await this.db.from('flocks').update({ is_active: isActive }).eq('id', id));
  }
}
