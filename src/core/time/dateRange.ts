export type DateRangeKey = 'all' | 'last7' | 'last30' | 'last90';

const RANGE_DAYS: Record<Exclude<DateRangeKey, 'all'>, number> = { last7: 7, last30: 30, last90: 90 };

export const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All dates' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
];

// The first day of a date filter, counting today. Undefined means no lower limit.
export function rangeStart(key: DateRangeKey, today: string): string | undefined {
  if (key === 'all') return undefined;
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (RANGE_DAYS[key] - 1));
  return date.toISOString().slice(0, 10);
}
