export type KpiStatus = 'actual' | 'estimated' | 'unavailable';
export type KpiUnit = 'money' | 'count' | 'percent' | 'grams' | 'quantity';

export type Kpi = {
  code: string;
  name: string;
  explanation: string;
  formulaText: string;
  requiredData: string;
  unit: KpiUnit;
  isHighlight: boolean;
  value: number | null;
  status: KpiStatus;
  note: string | null;
};

export type MonthlyPoint = { month: string; revenue: number; expenses: number };

export type RecentActivity = {
  id: string;
  kind: 'sale' | 'expense' | 'activity';
  occurredOn: string;
  label: string;
  amount: number | null;
  quantity: number | null;
  unit: string | null;
};

export type CompletenessItem = { item: string; label: string; isStarted: boolean };

// FR-E24: an insight says plainly whether it is a fact, a reading of the facts, or advice.
export type InsightKind = 'fact' | 'interpretation' | 'recommendation' | 'data_quality';

export type Insight = {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  // FR-E23: the data and reporting period behind the insight.
  evidence: string;
  // The measure it is about, if any, so an action planned from it can link back (Plan journey 5.3).
  kpiCode: string | null;
};
