import type { CompletenessItem, Kpi, MonthlyPoint, RecentActivity } from './models';

type DateRange = { from: string; to: string };

export interface AnalyticsRepository {
  computeKpis(businessId: string, range: DateRange): Promise<Kpi[]>;
  monthlySeries(businessId: string, months: number): Promise<MonthlyPoint[]>;
  recentActivity(businessId: string, limit: number): Promise<RecentActivity[]>;
  dataCompleteness(businessId: string, range: DateRange): Promise<CompletenessItem[]>;
}
