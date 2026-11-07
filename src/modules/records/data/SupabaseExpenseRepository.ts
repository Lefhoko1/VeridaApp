import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, nullableNumeric, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { Expense, ExpenseInput, RecordFilter } from '../domain/models';
import type { ExpenseRepository } from '../domain/repositories';
import { escapeForSearch, LIST_LIMIT } from './query';

const COLUMNS = 'id, occurred_on, category, description, amount, quantity, unit, certainty, notes, status, void_reason';

const rowSchema = z
  .object({
    id: z.string(),
    occurred_on: z.string(),
    category: z.string(),
    description: z.string(),
    amount: numeric,
    quantity: nullableNumeric,
    unit: z.string().nullable(),
    certainty: z.enum(['recorded', 'estimated', 'incomplete']),
    notes: z.string().nullable(),
    status: z.enum(['recorded', 'voided']),
    void_reason: z.string().nullable(),
  })
  .transform(
    (row): Expense => ({
      id: row.id,
      occurredOn: row.occurred_on,
      category: row.category,
      description: row.description,
      amount: row.amount,
      quantity: row.quantity,
      unit: row.unit,
      certainty: row.certainty,
      notes: row.notes,
      status: row.status,
      voidReason: row.void_reason,
    }),
  );

const toRow = (input: ExpenseInput) => ({
  occurred_on: input.occurredOn,
  category: input.category,
  description: input.description,
  amount: input.amount,
  quantity: input.quantity,
  unit: input.unit,
  certainty: input.certainty,
  notes: input.notes,
});

export class SupabaseExpenseRepository implements ExpenseRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('records');
  }

  async list(businessId: string, filter: RecordFilter): Promise<Expense[]> {
    let query = this.db.from('expenses').select(COLUMNS).eq('business_id', businessId);
    if (filter.categories?.length) query = query.in('category', filter.categories);
    if (filter.from) query = query.gte('occurred_on', filter.from);
    if (filter.to) query = query.lte('occurred_on', filter.to);
    if (filter.search) {
      const term = escapeForSearch(filter.search);
      query = query.or(`description.ilike.%${term}%,category.ilike.%${term}%,notes.ilike.%${term}%`);
    }
    return parseRows(
      rowSchema,
      await query.order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(LIST_LIMIT),
    );
  }

  async get(id: string): Promise<Expense> {
    return parseRow(rowSchema, await this.db.from('expenses').select(COLUMNS).eq('id', id).single());
  }

  async create(businessId: string, input: ExpenseInput): Promise<void> {
    assertSuccess(await this.db.from('expenses').insert({ business_id: businessId, ...toRow(input) }));
  }

  async createMany(businessId: string, inputs: ExpenseInput[]): Promise<void> {
    assertSuccess(await this.db.from('expenses').insert(inputs.map((input) => ({ business_id: businessId, ...toRow(input) }))));
  }

  async update(id: string, input: ExpenseInput): Promise<void> {
    assertSuccess(await this.db.from('expenses').update(toRow(input)).eq('id', id));
  }

  async void(id: string, reason: string): Promise<void> {
    assertSuccess(await this.db.rpc('void_expense', { p_id: id, p_reason: reason }));
  }
}
