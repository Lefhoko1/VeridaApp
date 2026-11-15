import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { CategoryKind, Product, ProductInput } from '../domain/models';
import type { CategoryRepository, ProductRepository } from '../domain/repositories';
import { escapeForSearch, LIST_LIMIT } from './query';

const COLUMNS = 'id, kind, name, category, description, unit, selling_price, is_active, image_path';

const rowSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['product', 'service']),
    name: z.string(),
    category: z.string().nullable(),
    description: z.string().nullable(),
    unit: z.string(),
    selling_price: numeric,
    is_active: z.boolean(),
    image_path: z.string().nullable(),
  })
  .transform(
    (row): Product => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      category: row.category,
      description: row.description,
      unit: row.unit,
      sellingPrice: row.selling_price,
      isActive: row.is_active,
      imagePath: row.image_path,
    }),
  );

const toRow = (input: ProductInput) => ({
  kind: input.kind,
  name: input.name,
  category: input.category,
  description: input.description,
  unit: input.unit,
  selling_price: input.sellingPrice,
  // Only sent when the form manages a file, so imports and older callers leave it alone.
  ...(input.imagePath !== undefined ? { image_path: input.imagePath } : {}),
});

export class SupabaseProductRepository implements ProductRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('records');
  }

  async list(businessId: string, search?: string): Promise<Product[]> {
    let query = this.db.from('products').select(COLUMNS).eq('business_id', businessId);
    if (search) {
      const term = escapeForSearch(search);
      query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%`);
    }
    return parseRows(rowSchema, await query.order('is_active', { ascending: false }).order('name').limit(LIST_LIMIT));
  }

  async get(id: string): Promise<Product> {
    return parseRow(rowSchema, await this.db.from('products').select(COLUMNS).eq('id', id).single());
  }

  async create(businessId: string, input: ProductInput): Promise<void> {
    assertSuccess(await this.db.from('products').insert({ business_id: businessId, ...toRow(input) }));
  }

  async update(id: string, input: ProductInput): Promise<void> {
    assertSuccess(await this.db.from('products').update(toRow(input)).eq('id', id));
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    assertSuccess(await this.db.from('products').update({ is_active: isActive }).eq('id', id));
  }

  async remove(id: string): Promise<void> {
    assertSuccess(await this.db.from('products').delete().eq('id', id));
  }
}

export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(businessId: string, kind: CategoryKind): Promise<string[]> {
    return parseRows(
      z.string(),
      await this.client.schema('records').rpc('list_categories', { p_business_id: businessId, p_kind: kind }),
    );
  }

  async add(businessId: string, kind: CategoryKind, name: string): Promise<void> {
    assertSuccess(await this.client.schema('records').from('custom_categories').insert({ business_id: businessId, kind, name }));
  }
}
