import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { formatMonth, formatMoney, todayIso } from '@/core/format/format';
import { businessScope } from '@/core/query/queryClient';
import { useActiveBusiness } from '@/modules/business';

import { generateInsights } from '../../domain/insights';
import type { Kpi } from '../../domain/models';
import { buildCustomPeriod, buildPeriod, previousPeriod, type PeriodKey, type ReportingPeriod } from '../../domain/period';
import { useAnalyticsDependencies } from '../di';
import { formatKpiValue, KPI_STATUS } from './kpiFormat';

const CHART_MONTHS = 6;

// A custom period applies only once its dates are valid, so a half-typed date never queries.
function usePeriod() {
  const [key, setKey] = useState<PeriodKey>('last30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const today = todayIso();

  const custom = useMemo(() => buildCustomPeriod(customFrom, customTo, today), [customFrom, customTo, today]);
  const period = useMemo((): ReportingPeriod => {
    if (key !== 'custom') return buildPeriod(key, today);
    return typeof custom === 'string' ? buildPeriod('last30', today) : custom;
  }, [key, custom, today]);

  return {
    period,
    periodKey: key,
    setPeriodKey: setKey,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    customError: key === 'custom' && typeof custom === 'string' && (customFrom !== '' || customTo !== '') ? custom : null,
  };
}

function presentKpi(kpi: Kpi, currency: string) {
  return {
    ...kpi,
    display: kpi.value === null ? '—' : formatKpiValue(kpi, kpi.value, currency),
    statusChip: KPI_STATUS[kpi.status],
  };
}

export type PresentedKpi = ReturnType<typeof presentKpi>;

export function useDashboardViewModel() {
  const { analytics } = useAnalyticsDependencies();
  const { business, industry, can } = useActiveBusiness();
  const queryClient = useQueryClient();
  const periodControl = usePeriod();
  const { period } = periodControl;
  const scope = [...businessScope(business.id), 'analytics'];
  const range = { from: period.from, to: period.to };
  const allowed = can('analytics.view');

  const kpis = useQuery({
    queryKey: [...scope, 'kpis', range],
    queryFn: () => analytics.computeKpis(business.id, range),
    enabled: allowed,
  });
  const recent = useQuery({
    queryKey: [...scope, 'recent'],
    queryFn: () => analytics.recentActivity(business.id, 5),
    enabled: can('records.view'),
  });
  const completeness = useQuery({
    queryKey: [...scope, 'completeness', range],
    queryFn: () => analytics.dataCompleteness(business.id, range),
    enabled: allowed,
  });

  const presented = (kpis.data ?? []).map((kpi) => presentKpi(kpi, business.currency));
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const revenue = presented.find((kpi) => kpi.code === 'revenue')?.value ?? 0;
  const expenses = presented.find((kpi) => kpi.code === 'expenses')?.value ?? 0;
  const barMax = Math.max(revenue, expenses, 1);

  return {
    businessName: business.name,
    isInactive: business.status !== 'active',
    chartTitle: industry?.chartTitle ?? 'Business activity',
    // Before permissions arrive `allowed` is false, so that alone must not show the denied state.
    loading: kpis.isLoading,
    error: kpis.error ? errorMessage(kpis.error) : null,
    refreshing: kpis.isRefetching,
    refresh: () => void queryClient.invalidateQueries({ queryKey: scope }),
    periodControl,
    period,
    highlights: presented.filter((kpi) => kpi.isHighlight),
    otherKpis: presented.filter((kpi) => !kpi.isHighlight),
    bars: {
      hasData: revenue > 0 || expenses > 0,
      revenue: { ratio: revenue / barMax, display: formatMoney(revenue, business.currency) },
      expenses: { ratio: expenses / barMax, display: formatMoney(expenses, business.currency) },
    },
    completeness: completeness.data ?? [],
    recent: recent.data ?? [],
    money: (amount: number) => formatMoney(amount, business.currency),
    selectedKpi: presented.find((kpi) => kpi.code === selectedCode) ?? null,
    selectKpi: setSelectedCode,
    canCreateRecords: can('records.create'),
  };
}

export function useInsightsViewModel() {
  const { analytics } = useAnalyticsDependencies();
  const { business, can } = useActiveBusiness();
  const queryClient = useQueryClient();
  const periodControl = usePeriod();
  const { period } = periodControl;
  const scope = [...businessScope(business.id), 'analytics'];
  const before = previousPeriod(period);
  const allowed = can('analytics.view');

  const current = useQuery({
    queryKey: [...scope, 'kpis', { from: period.from, to: period.to }],
    queryFn: () => analytics.computeKpis(business.id, { from: period.from, to: period.to }),
    enabled: allowed,
  });
  const previous = useQuery({
    queryKey: [...scope, 'kpis', { from: before.from, to: before.to }],
    queryFn: () => analytics.computeKpis(business.id, { from: before.from, to: before.to }),
    enabled: allowed,
  });
  const series = useQuery({
    queryKey: [...scope, 'monthly', CHART_MONTHS],
    queryFn: () => analytics.monthlySeries(business.id, CHART_MONTHS),
    enabled: allowed,
  });

  const insights = useMemo(
    () =>
      current.data && previous.data
        ? generateInsights({
            current: current.data,
            previous: previous.data,
            period,
            formatValue: (kpi, value) => formatKpiValue(kpi, value, business.currency),
          })
        : [],
    [current.data, previous.data, period, business.currency],
  );

  return {
    loading: current.isLoading || previous.isLoading,
    error: current.error || previous.error ? errorMessage(current.error ?? previous.error) : null,
    refreshing: current.isRefetching,
    refresh: () => void queryClient.invalidateQueries({ queryKey: scope }),
    periodControl,
    period,
    insights,
    // Plan journey 5.3: someone who works on tasks can turn an insight into planned actions.
    canPlan: can('plan.tasks'),
    chart: (series.data ?? []).map((point) => ({
      key: point.month,
      label: formatMonth(point.month),
      primary: point.revenue,
      secondary: point.expenses,
    })),
    hasChartData: (series.data ?? []).some((point) => point.revenue > 0 || point.expenses > 0),
  };
}
