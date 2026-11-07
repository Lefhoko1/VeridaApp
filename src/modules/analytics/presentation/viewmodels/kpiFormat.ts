import { formatMoney, formatQuantity } from '@/core/format/format';

import type { Kpi, KpiStatus } from '../../domain/models';

export function formatKpiValue(kpi: Pick<Kpi, 'unit'>, value: number, currency: string): string {
  switch (kpi.unit) {
    case 'money':
      return formatMoney(value, currency);
    case 'percent':
      return `${value.toLocaleString('en', { maximumFractionDigits: 1 })}%`;
    case 'grams':
      return `${value.toLocaleString('en', { maximumFractionDigits: 1 })} g`;
    default:
      return formatQuantity(value);
  }
}

// FR-E15: every KPI shows whether it is actual, estimated or unavailable.
export const KPI_STATUS: Record<KpiStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  actual: { label: 'Actual', tone: 'ok' },
  estimated: { label: 'Estimated', tone: 'warn' },
  unavailable: { label: 'Needs data', tone: 'neutral' },
};
