import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { RecordFilter, Sale, SaleInput } from '../domain/models';
import type { SalesRepository } from '../domain/repositories';
import { escapeForSearch, LIST_LIMIT } from './query';

const COLUMNS = 'id, occurred_on, product_id, item_name, category, quantity, unit, unit_price, total_amount, notes, status, void_reason';

const rowSchema = z
  .object({
    id: z.string(),
    occurred_on: z.string(),
    product_id: z.string().nullable(),
    item_name: z.string(),
    category: z.string(),
    quantity: numeric,
    unit: z.string().nullable(),
    unit_price: numeric,
    total_amount: numeric,
    notes: z.string().nullable(),
    status: z.enum(['recorded', 'voided']),
    void_reason: z.string().nullable(),
  })
  .transform(
    (row): Sale => ({
      id: row.id,
      occurredOn: row.occurred_on,
      productId: row.product_id,
      itemName: row.item_name,
      category: row.category,
      quantity: row.quantity,
      unit: row.unit,
      unitPrice: row.unit_price,
      totalAmount: row.total_amount,
      notes: row.notes,
      status: row.status,
      voidReason: row.void_reason,
    }),
  );

const toRow = (input: SaleInput) => ({
  occurred_on: input.occurredOn,
  product_id: input.productId,
  item_name: input.itemName,
  category: input.category,
  quantity: input.quantity,
  unit: input.unit,
  unit_price: input.unitPrice,
  notes: input.notes,
});

export class SupabaseSalesRepository implements SalesRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('records');
  }

  async list(businessId: string, filter: RecordFilter): Promise<Sale[]> {
    let query = this.db.from('sales_transactions').select(COLUMNS).eq('business_id', businessId);
    if (filter.categories?.length) query = query.in('category', filter.categories);
    if (filter.from) query = query.gte('occurred_on', filter.from);
    if (filter.to) query = query.lte('occurred_on', filter.to);
    if (filter.search) {
      const term = escapeForSearch(filter.search);
      query = query.or(`item_name.ilike.%${term}%,notes.ilike.%${term}%`);
    }
    return parseRows(
      rowSchema,
      await query.order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(LIST_LIMIT),
    );
  }

  async get(id: string): Promise<Sale> {
    return parseRow(rowSchema, await this.db.from('sales_transactions').select(COLUMNS).eq('id', id).single());
  }

  async create(businessId: string, input: SaleInput): Promise<void> {
    assertSuccess(await this.db.from('sales_transactions').insert({ business_id: businessId, ...toRow(input) }));
  }

  async createMany(businessId: string, inputs: SaleInput[]): Promise<void> {
    assertSuccess(await this.db.from('sales_transactions').insert(inputs.map((input) => ({ business_id: businessId, ...toRow(input) }))));
  }

  async update(id: string, input: SaleInput): Promise<void> {
    assertSuccess(await this.db.from('sales_transactions').update(toRow(input)).eq('id', id));
  }

  async void(id: string, reason: string): Promise<void> {
    assertSuccess(await this.db.rpc('void_sale', { p_id: id, p_reason: reason }));
  }
}
