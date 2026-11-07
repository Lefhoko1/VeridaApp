export type PresetPeriodKey = 'last7' | 'last30' | 'last90';
export type PeriodKey = PresetPeriodKey | 'custom';

export type ReportingPeriod = { key: PeriodKey; label: string; from: string; to: string };

const PERIOD_DAYS: Record<PresetPeriodKey, { days: number; label: string }> = {
  last7: { days: 7, label: 'Last 7 days' },
  last30: { days: 30, label: 'Last 30 days' },
  last90: { days: 90, label: 'Last 90 days' },
};

export const PERIOD_OPTIONS = [
  ...(Object.keys(PERIOD_DAYS) as PresetPeriodKey[]).map((value) => ({ value, label: PERIOD_DAYS[value].label })),
  { value: 'custom', label: 'Choose dates' },
];

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const toUtc = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

// All arithmetic is done in UTC on YYYY-MM-DD strings, so a clock change cannot move a day.
function addDays(isoDate: string, days: number): string {
  const date = toUtc(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildPeriod(key: PresetPeriodKey, today: string): ReportingPeriod {
  const { days, label } = PERIOD_DAYS[key];
  return { key, label, from: addDays(today, -(days - 1)), to: today };
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = toUtc(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// FR-E06, FR-E07, FR-E25: any past period can be viewed. Returns a message when it isn't valid.
export function buildCustomPeriod(from: string, to: string, today: string): ReportingPeriod | string {
  if (!isRealDate(from) || !isRealDate(to)) return 'Enter both dates as YYYY-MM-DD.';
  if (from > to) return 'The start date must be before the end date.';
  if (to > today) return 'The end date cannot be in the future.';
  return { key: 'custom', label: `${from} to ${to}`, from, to };
}

// The equally long period immediately before, used to measure change.
export function previousPeriod(period: ReportingPeriod): ReportingPeriod {
  const days = Math.round((toUtc(period.to).getTime() - toUtc(period.from).getTime()) / DAY_MS) + 1;
  const to = addDays(period.from, -1);
  return { key: period.key, label: `Previous ${days} days`, from: addDays(to, -(days - 1)), to };
}
