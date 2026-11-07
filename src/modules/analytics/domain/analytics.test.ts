import { generateInsights } from './insights';
import type { Kpi } from './models';
import { buildCustomPeriod, buildPeriod, previousPeriod, type ReportingPeriod } from './period';

const period = buildPeriod('last30', '2026-11-02');

function kpi(overrides: Partial<Kpi> & { code: string }): Kpi {
  return {
    name: overrides.code,
    explanation: 'Explanation.',
    formulaText: 'Formula',
    requiredData: 'Some data',
    unit: 'money',
    isHighlight: false,
    value: null,
    status: 'unavailable',
    note: null,
    ...overrides,
  };
}

const run = (current: Kpi[], previous: Kpi[] = []) =>
  generateInsights({ current, previous, period, formatValue: (_kpi, value) => `P${value}` });

const records = (value: number) => kpi({ code: 'records_captured', value, status: 'actual' });

describe('reporting periods', () => {
  it('includes both ends and spans the stated number of days', () => {
    expect(buildPeriod('last7', '2026-11-02')).toMatchObject({ from: '2026-10-27', to: '2026-11-02' });
    expect(buildPeriod('last30', '2026-11-02')).toMatchObject({ from: '2026-10-04', to: '2026-11-02' });
  });

  it('crosses a leap day correctly', () => {
    expect(buildPeriod('last7', '2024-03-02').from).toBe('2024-02-25');
  });

  it('places the previous period directly before, with no gap or overlap', () => {
    const before = previousPeriod(period);
    expect(before.to).toBe('2026-10-03');
    expect(before.from).toBe('2026-09-04');
  });
});

describe('custom reporting periods (FR-E06, FR-E07, FR-E25)', () => {
  const today = '2026-11-03';

  it('accepts any past range', () => {
    expect(buildCustomPeriod('2026-01-01', '2026-01-31', today)).toMatchObject({ key: 'custom', from: '2026-01-01', to: '2026-01-31' });
  });

  it('accepts a single day, and a range ending today', () => {
    expect(typeof buildCustomPeriod(today, today, today)).toBe('object');
  });

  it.each([
    ['a half-typed date', '2026-01', '2026-01-31', 'YYYY-MM-DD'],
    ['a date that does not exist', '2026-02-30', '2026-03-01', 'YYYY-MM-DD'],
    ['an inverted range', '2026-02-01', '2026-01-01', 'before the end date'],
    ['a future end date', '2026-11-01', '2026-11-30', 'future'],
  ])('rejects %s', (_name, from, to, message) => {
    expect(buildCustomPeriod(from, to, today)).toContain(message);
  });

  it('compares a custom range with the same length just before it', () => {
    const period = buildCustomPeriod('2026-03-11', '2026-03-20', today) as ReportingPeriod;
    expect(previousPeriod(period)).toMatchObject({ from: '2026-03-01', to: '2026-03-10', label: 'Previous 10 days' });
  });

  it('handles a month with no fixed length', () => {
    const period = buildCustomPeriod('2026-02-01', '2026-02-28', today) as ReportingPeriod;
    expect(previousPeriod(period)).toMatchObject({ from: '2026-01-04', to: '2026-01-31' });
  });
});

describe('insights', () => {
  it('guides a new business instead of inventing findings', () => {
    const insights = run([records(0), kpi({ code: 'revenue' })]);
    expect(insights.map((i) => i.id)).toEqual(['getting-started', 'data-readiness']);
  });

  it('states recorded figures as facts, naming the evidence and period (FR-E23, FR-E24)', () => {
    const insights = run([records(5), kpi({ code: 'revenue', name: 'Revenue', value: 100, status: 'actual' })]);
    const fact = insights.find((i) => i.id === 'revenue-fact');
    expect(fact).toMatchObject({ kind: 'fact', title: 'Revenue: P100' });
    expect(fact?.evidence).toContain(period.from);
    expect(fact?.evidence).toContain(period.to);
  });

  it('reports missing data as a data-quality issue, not as zero (FR-E21)', () => {
    const insights = run([records(5), kpi({ code: 'expenses', name: 'Recorded expenses' })]);
    expect(insights.find((i) => i.id === 'expenses-missing')?.kind).toBe('data_quality');
    expect(insights.some((i) => i.id === 'expenses-fact')).toBe(false);
  });

  it('presents movement as an interpretation that does not claim a cause (FR-E20, FR-E24)', () => {
    const insights = run([records(5), kpi({ code: 'revenue', name: 'Revenue', value: 120, status: 'actual' })], [kpi({ code: 'revenue', value: 100, status: 'actual' })]);
    const change = insights.find((i) => i.id === 'revenue-change');
    expect(change?.kind).toBe('interpretation');
    expect(change?.title).toBe('Revenue is up 20%');
    expect(change?.body).toContain('check your records');
  });

  it('flags unusual changes (FR-E19)', () => {
    const insights = run([records(5), kpi({ code: 'revenue', name: 'Revenue', value: 50, status: 'actual' })], [kpi({ code: 'revenue', value: 100, status: 'actual' })]);
    expect(insights.find((i) => i.id === 'revenue-change')?.title).toBe('Revenue is down 50%, an unusual change');
  });

  it('ignores small movements as normal variation', () => {
    const insights = run([records(5), kpi({ code: 'revenue', value: 105, status: 'actual' })], [kpi({ code: 'revenue', value: 100, status: 'actual' })]);
    expect(insights.some((i) => i.id === 'revenue-change')).toBe(false);
  });

  it('does not compute a change without a comparable previous value', () => {
    const now = kpi({ code: 'revenue', value: 100, status: 'actual' });
    expect(run([records(5), now], [kpi({ code: 'revenue' })]).some((i) => i.id === 'revenue-change')).toBe(false);
    expect(run([records(5), now], [kpi({ code: 'revenue', value: 0, status: 'actual' })]).some((i) => i.id === 'revenue-change')).toBe(false);
  });

  it('surfaces estimates as data-quality notes', () => {
    const insights = run([records(5), kpi({ code: 'hen_day_rate', name: 'Laying rate', unit: 'percent', value: 80, status: 'estimated', note: 'Excludes 1 day(s).' })]);
    expect(insights.find((i) => i.id === 'hen_day_rate-quality')?.body).toBe('Excludes 1 day(s).');
  });

  it('recommends tracking a missing headline measure (FR-E22)', () => {
    const insights = run([records(5), kpi({ code: 'hen_day_rate', name: 'Hen-day laying rate', isHighlight: true, requiredData: 'Egg and flock records' })]);
    const next = insights.find((i) => i.kind === 'recommendation');
    expect(next?.title).toContain('hen-day laying rate');
    expect(next?.body).toContain('egg and flock records');
  });
});
