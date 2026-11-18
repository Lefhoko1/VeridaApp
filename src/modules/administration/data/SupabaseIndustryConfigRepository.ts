import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { assertSuccess, nullableNumeric, numeric, parseRow, parseRows } from '@/core/supabase/response';

import type { ActivityTypeConfig, ActivityTypeInput, BusinessCategoryConfig, IndustryConfig, IndustryKpi, KpiDefinition, RecordCategory } from '../domain/models';
import type { IndustryConfigRepository } from '../domain/repositories';

const INDUSTRY_COLUMNS = 'code, category_code, name, short_name, description, icon, chart_title, sort_order, is_active';

const industrySchema = z
  .object({ code: z.string(), category_code: z.string(), name: z.string(), short_name: z.string(), description: z.string(), icon: z.string(), chart_title: z.string(), sort_order: numeric, is_active: z.boolean() })
  .transform(
    (row): IndustryConfig => ({
      code: row.code,
      categoryCode: row.category_code,
      name: row.name,
      shortName: row.short_name,
      description: row.description,
      icon: row.icon,
      chartTitle: row.chart_title,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }),
  );

const toIndustryRow = (input: Omit<IndustryConfig, 'code'>) => ({
  category_code: input.categoryCode,
  name: input.name,
  short_name: input.shortName,
  description: input.description,
  icon: input.icon,
  chart_title: input.chartTitle,
  sort_order: input.sortOrder,
  is_active: input.isActive,
});

const CATEGORY_COLUMNS = 'code, name, description, icon, sort_order, is_active';

const businessCategorySchema = z
  .object({ code: z.string(), name: z.string(), description: z.string(), icon: z.string(), sort_order: numeric, is_active: z.boolean() })
  .transform(
    (row): BusinessCategoryConfig => ({
      code: row.code,
      name: row.name,
      description: row.description,
      icon: row.icon,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }),
  );

const toCategoryRow = (input: Omit<BusinessCategoryConfig, 'code'>) => ({
  name: input.name,
  description: input.description,
  icon: input.icon,
  sort_order: input.sortOrder,
  is_active: input.isActive,
});

const categorySchema = z.object({ id: z.string(), kind: z.enum(['sale', 'expense']), name: z.string() }).transform((row): RecordCategory => row);

const ACTIVITY_COLUMNS = 'id, code, name, description, default_unit, uses_flock, allows_negative, min_quantity, max_quantity, whole_numbers_only, notes_required, allowed_units';

const activitySchema = z
  .object({ id: z.string(), code: z.string(), name: z.string(), description: z.string(), default_unit: z.string(), uses_flock: z.boolean(), allows_negative: z.boolean(), min_quantity: nullableNumeric, max_quantity: nullableNumeric, whole_numbers_only: z.boolean(), notes_required: z.boolean(), allowed_units: z.array(z.string()) })
  .transform(
    (row): ActivityTypeConfig => ({
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

const toActivityRow = (input: ActivityTypeInput) => ({
  code: input.code,
  name: input.name,
  description: input.description,
  default_unit: input.defaultUnit,
  uses_flock: input.usesFlock,
  allows_negative: input.allowsNegative,
  min_quantity: input.minQuantity,
  max_quantity: input.maxQuantity,
  whole_numbers_only: input.wholeNumbersOnly,
  notes_required: input.notesRequired,
  allowed_units: input.allowedUnits,
});

const KPI_COLUMNS = 'code, name, explanation, formula_text, required_data, unit_kind, formula, activity_code';

const kpiSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    explanation: z.string(),
    formula_text: z.string(),
    required_data: z.string(),
    unit_kind: z.enum(['money', 'count', 'percent', 'grams', 'quantity']),
    formula: z.string(),
    activity_code: z.string().nullable(),
  })
  .transform(
    (row): KpiDefinition => ({
      code: row.code,
      name: row.name,
      explanation: row.explanation,
      formulaText: row.formula_text,
      requiredData: row.required_data,
      unitKind: row.unit_kind,
      formula: row.formula,
      activityCode: row.activity_code,
    }),
  );

const industryKpiSchema = z.object({ kpi_code: z.string(), is_highlight: z.boolean() }).transform((row): IndustryKpi => ({ kpiCode: row.kpi_code, isHighlight: row.is_highlight }));

// Row-level security limits every write here to platform administrators.
export class SupabaseIndustryConfigRepository implements IndustryConfigRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('platform');
  }

  async listBusinessCategories(): Promise<BusinessCategoryConfig[]> {
    return parseRows(businessCategorySchema, await this.db.from('business_categories').select(CATEGORY_COLUMNS).order('sort_order'));
  }

  async getBusinessCategory(code: string): Promise<BusinessCategoryConfig> {
    return parseRow(businessCategorySchema, await this.db.from('business_categories').select(CATEGORY_COLUMNS).eq('code', code).single());
  }

  async createBusinessCategory(input: BusinessCategoryConfig): Promise<void> {
    assertSuccess(await this.db.from('business_categories').insert({ code: input.code, ...toCategoryRow(input) }));
  }

  async updateBusinessCategory(code: string, input: Omit<BusinessCategoryConfig, 'code'>): Promise<void> {
    assertSuccess(await this.db.from('business_categories').update(toCategoryRow(input)).eq('code', code));
  }

  async listIndustries(): Promise<IndustryConfig[]> {
    return parseRows(industrySchema, await this.db.from('industries').select(INDUSTRY_COLUMNS).order('sort_order'));
  }

  async getIndustry(code: string): Promise<IndustryConfig> {
    return parseRow(industrySchema, await this.db.from('industries').select(INDUSTRY_COLUMNS).eq('code', code).single());
  }

  async createIndustry(input: IndustryConfig): Promise<void> {
    assertSuccess(await this.db.from('industries').insert({ code: input.code, ...toIndustryRow(input) }));
  }

  async updateIndustry(code: string, input: Omit<IndustryConfig, 'code'>): Promise<void> {
    assertSuccess(await this.db.from('industries').update(toIndustryRow(input)).eq('code', code));
  }

  async listCategories(code: string): Promise<RecordCategory[]> {
    return parseRows(categorySchema, await this.db.from('record_categories').select('id, kind, name').eq('industry_code', code).order('sort_order'));
  }

  async addCategory(code: string, kind: 'sale' | 'expense', name: string): Promise<void> {
    assertSuccess(await this.db.from('record_categories').insert({ industry_code: code, kind, name }));
  }

  async removeCategory(id: string): Promise<void> {
    assertSuccess(await this.db.from('record_categories').delete().eq('id', id));
  }

  async listActivityTypes(code: string): Promise<ActivityTypeConfig[]> {
    return parseRows(activitySchema, await this.db.from('activity_types').select(ACTIVITY_COLUMNS).eq('industry_code', code).order('sort_order'));
  }

  async addActivityType(code: string, input: ActivityTypeInput): Promise<void> {
    assertSuccess(await this.db.from('activity_types').insert({ industry_code: code, ...toActivityRow(input) }));
  }

  async updateActivityType(id: string, input: ActivityTypeInput): Promise<void> {
    assertSuccess(await this.db.from('activity_types').update(toActivityRow(input)).eq('id', id));
  }

  async removeActivityType(id: string): Promise<void> {
    assertSuccess(await this.db.from('activity_types').delete().eq('id', id));
  }

  async listKpiDefinitions(): Promise<KpiDefinition[]> {
    return parseRows(kpiSchema, await this.db.from('kpi_definitions').select(KPI_COLUMNS).order('name'));
  }

  async createKpiDefinition(input: KpiDefinition): Promise<void> {
    assertSuccess(
      await this.db.from('kpi_definitions').insert({
        code: input.code,
        name: input.name,
        explanation: input.explanation,
        formula_text: input.formulaText,
        required_data: input.requiredData,
        unit_kind: input.unitKind,
        formula: input.formula,
        activity_code: input.activityCode,
      }),
    );
  }

  async listIndustryKpis(code: string): Promise<IndustryKpi[]> {
    return parseRows(industryKpiSchema, await this.db.from('industry_kpis').select('kpi_code, is_highlight').eq('industry_code', code).order('sort_order'));
  }

  async setIndustryKpi(code: string, kpiCode: string, enabled: boolean, isHighlight: boolean): Promise<void> {
    const table = this.db.from('industry_kpis');
    if (!enabled) {
      assertSuccess(await table.delete().eq('industry_code', code).eq('kpi_code', kpiCode));
      return;
    }
    assertSuccess(await table.upsert({ industry_code: code, kpi_code: kpiCode, is_highlight: isHighlight }));
  }
}
