import type { Insight, Kpi } from './models';
import type { ReportingPeriod } from './period';

// A change smaller than this is treated as normal variation rather than something to report.
const NOTABLE_CHANGE = 0.1;
const UNUSUAL_CHANGE = 0.3;

type Formatter = (kpi: Kpi, value: number) => string;

type InsightInput = {
  current: Kpi[];
  previous: Kpi[];
  period: ReportingPeriod;
  formatValue: Formatter;
};

const findKpi = (kpis: Kpi[], code: string) => kpis.find((kpi) => kpi.code === code);

function percentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / Math.abs(previous);
}

function describeChange(change: number): string {
  const size = Math.abs(Math.round(change * 100));
  return `${change > 0 ? 'up' : 'down'} ${size}%`;
}

// FR-E18 to FR-E24. Every figure comes from a KPI the analytics service has already calculated,
// so this only reads results: it never performs a financial calculation of its own.
export function generateInsights({ current, previous, period, formatValue }: InsightInput): Insight[] {
  const insights: Insight[] = [];
  const evidence = (what: string) => `${what}, ${period.from} to ${period.to}`;

  const records = findKpi(current, 'records_captured');
  if (!records || records.value === 0) {
    return [
      {
        id: 'getting-started',
        kind: 'recommendation',
        title: 'Your business story starts with a record',
        body: 'Add a sale, an expense or an operational activity. Verida will begin building a picture of your business.',
        evidence: evidence('No records'),
      },
      {
        id: 'data-readiness',
        kind: 'data_quality',
        title: 'No formal records? That is okay.',
        body: 'Start with a few simple entries. Verida will show what is known and what information is still missing.',
        evidence: evidence('No records'),
      },
    ];
  }

  for (const code of ['revenue', 'expenses']) {
    const kpi = findKpi(current, code);
    if (!kpi) continue;
    if (kpi.value === null) {
      insights.push({
        id: `${code}-missing`,
        kind: 'data_quality',
        title: `No ${code === 'revenue' ? 'sales' : 'expenses'} recorded`,
        body: `Without these, Verida cannot show ${kpi.name.toLowerCase()} for this period. ${kpi.requiredData} is needed.`,
        evidence: evidence('Your records'),
      });
      continue;
    }
    insights.push({
      id: `${code}-fact`,
      kind: 'fact',
      title: `${kpi.name}: ${formatValue(kpi, kpi.value)}`,
      body: kpi.explanation,
      evidence: evidence(kpi.formulaText),
    });
  }

  // FR-E19, FR-E20: movement against the previous period, for KPIs with a value in both.
  for (const kpi of current) {
    if (kpi.code === 'records_captured' || kpi.value === null) continue;
    const before = findKpi(previous, kpi.code)?.value;
    if (before === null || before === undefined) continue;
    const change = percentChange(kpi.value, before);
    if (change === null || Math.abs(change) < NOTABLE_CHANGE) continue;
    const unusual = Math.abs(change) >= UNUSUAL_CHANGE;
    insights.push({
      id: `${kpi.code}-change`,
      kind: 'interpretation',
      title: `${kpi.name} is ${describeChange(change)}${unusual ? ', an unusual change' : ''}`,
      body: `It moved from ${formatValue(kpi, before)} to ${formatValue(kpi, kpi.value)}. This may reflect real change or differences in what was recorded, so check your records before drawing a conclusion.`,
      evidence: evidence(`${kpi.name} compared with the previous period`),
    });
  }

  // FR-E21: anything calculated with gaps is called out.
  for (const kpi of current) {
    if (kpi.status === 'estimated' && kpi.note && kpi.code !== 'recorded_balance') {
      insights.push({
        id: `${kpi.code}-quality`,
        kind: 'data_quality',
        title: `${kpi.name} is an estimate`,
        body: kpi.note,
        evidence: evidence(kpi.requiredData),
      });
    }
  }

  // FR-E22: advice based only on the gaps and patterns above.
  const missingOperational = current.find((kpi) => kpi.isHighlight && !['revenue', 'expenses'].includes(kpi.code) && kpi.status === 'unavailable');
  insights.push(
    missingOperational
      ? {
          id: 'next-step-operational',
          kind: 'recommendation',
          title: `Next step: start tracking ${missingOperational.name.toLowerCase()}`,
          body: `${missingOperational.explanation} To calculate it, Verida needs: ${missingOperational.requiredData.toLowerCase()}.`,
          evidence: evidence(`${missingOperational.name} is unavailable`),
        }
      : {
          id: 'next-step-habit',
          kind: 'recommendation',
          title: 'Keep building a consistent record-keeping habit',
          body: `You have ${records.value} records in this period. Regular records make patterns easier to see.`,
          evidence: evidence('Records captured'),
        },
  );

  return insights;
}
