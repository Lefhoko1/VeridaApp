import { z } from 'zod';

import type { SupabaseClient } from '@/core/supabase/client';
import { nullableNumeric, numeric, parseRows } from '@/core/supabase/response';

import type { CompletenessItem, Kpi, MonthlyPoint, RecentActivity } from '../domain/models';
import type { AnalyticsRepository } from '../domain/repositories';

const kpiSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    explanation: z.string(),
    formula_text: z.string(),
    required_data: z.string(),
    unit_kind: z.enum(['money', 'count', 'percent', 'grams', 'quantity']),
    is_highlight: z.boolean(),
    value: nullableNumeric,
    status: z.enum(['actual', 'estimated', 'unavailable']),
    note: z.string().nullable(),
  })
  .transform(
    (row): Kpi => ({
      code: row.code,
      name: row.name,
      explanation: row.explanation,
      formulaText: row.formula_text,
      requiredData: row.required_data,
      unit: row.unit_kind,
      isHighlight: row.is_highlight,
      value: row.value,
      status: row.status,
      note: row.note,
    }),
  );

const monthlySchema = z.object({ month: z.string(), revenue: numeric, expenses: numeric }).transform((row): MonthlyPoint => row);

const recentSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['sale', 'expense', 'activity']),
    occurred_on: z.string(),
    label: z.string(),
    amount: nullableNumeric,
    quantity: nullableNumeric,
    unit: z.string().nullable(),
  })
  .transform(
    (row): RecentActivity => ({
      id: row.id,
      kind: row.kind,
      occurredOn: row.occurred_on,
      label: row.label,
      amount: row.amount,
      quantity: row.quantity,
      unit: row.unit,
    }),
  );

const completenessSchema = z
  .object({ item: z.string(), label: z.string(), is_started: z.boolean() })
  .transform((row): CompletenessItem => ({ item: row.item, label: row.label, isStarted: row.is_started }));

export class SupabaseAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly client: SupabaseClient) {}

  private get db() {
    return this.client.schema('analytics');
  }

  async computeKpis(businessId: string, range: { from: string; to: string }): Promise<Kpi[]> {
    return parseRows(kpiSchema, await this.db.rpc('compute_kpis', { p_business_id: businessId, p_from: range.from, p_to: range.to }));
  }

  async monthlySeries(businessId: string, months: number): Promise<MonthlyPoint[]> {
    return parseRows(monthlySchema, await this.db.rpc('monthly_series', { p_business_id: businessId, p_months: months }));
  }

  async recentActivity(businessId: string, limit: number): Promise<RecentActivity[]> {
    return parseRows(recentSchema, await this.db.rpc('recent_activity', { p_business_id: businessId, p_limit: limit }));
  }

  async dataCompleteness(businessId: string, range: { from: string; to: string }): Promise<CompletenessItem[]> {
    return parseRows(completenessSchema, await this.db.rpc('data_completeness', { p_business_id: businessId, p_from: range.from, p_to: range.to }));
  }
}
