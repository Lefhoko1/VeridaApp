import { formatMoney, formatQuantity, todayIso } from '@/core/format/format';
import type { SupabaseClient } from '@/core/supabase/client';
import { SupabaseBusinessFileStore } from '@/core/supabase/businessFileStore';
import { createAccountDependencies } from '@/modules/account';
import { createAdministrationDependencies } from '@/modules/administration';
import { createAnalyticsDependencies, type AnalyticsRepository, type Kpi } from '@/modules/analytics';
import { createAssistantDependencies, createReceiptReader, type BusinessFact, type BusinessFactsProvider } from '@/modules/assistant';
import { createBusinessDependencies } from '@/modules/business';
import { createLearningDependencies } from '@/modules/learning';
import { createNotificationsDependencies } from '@/modules/notifications';
import { createOperationsDependencies } from '@/modules/operations';
import { createRecordsDependencies } from '@/modules/records';

const FACT_PERIOD_DAYS = 30;

function daysBefore(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function displayKpi(kpi: Kpi, currency: string): string | null {
  if (kpi.value === null) return null;
  switch (kpi.unit) {
    case 'money':
      return formatMoney(kpi.value, currency);
    case 'percent':
      return `${kpi.value}%`;
    case 'grams':
      return `${kpi.value} g`;
    default:
      return formatQuantity(kpi.value);
  }
}

// Connects the assistant to the analytics service: the only place these two modules meet.
function createBusinessFactsProvider(analytics: AnalyticsRepository): BusinessFactsProvider {
  return async ({ businessId, currency }) => {
    const to = todayIso();
    const kpis = await analytics.computeKpis(businessId, { from: daysBefore(to, FACT_PERIOD_DAYS - 1), to });
    const facts: BusinessFact[] = kpis.map((kpi) => ({
      code: kpi.code,
      name: kpi.name,
      display: displayKpi(kpi, currency),
      value: kpi.value,
      status: kpi.status,
      explanation: kpi.explanation,
      note: kpi.note,
    }));
    return { periodLabel: `the last ${FACT_PERIOD_DAYS} days`, facts };
  };
}

export function createAppDependencies(client: SupabaseClient) {
  const analytics = createAnalyticsDependencies(client);
  // Receipts, product photos and logos: one store, shared by the modules that attach files.
  const files = new SupabaseBusinessFileStore(client);
  return {
    account: createAccountDependencies(client),
    business: createBusinessDependencies(client, files),
    // Records reads receipts through the assistant's AI service; this is where the two meet.
    records: createRecordsDependencies(client, { files, receipts: createReceiptReader(client) }),
    operations: createOperationsDependencies(client, files),
    analytics,
    learning: createLearningDependencies(client),
    assistant: createAssistantDependencies(client, createBusinessFactsProvider(analytics.analytics)),
    notifications: createNotificationsDependencies(client),
    administration: createAdministrationDependencies(client),
  };
}

export type AppDependencies = ReturnType<typeof createAppDependencies>;
