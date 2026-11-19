// Plain date logic for the calendar picker, kept apart from the component so it tests without React.
// Dates are YYYY-MM-DD strings, worked out in UTC so that no time zone can move a day.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const isValidDate = (iso: string) => ISO.test(iso) && !Number.isNaN(fromIso(iso).getTime()) && toIso(fromIso(iso)) === iso;

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The weeks of a month, Monday first, with blanks before the 1st and after the last day.
export function monthCells(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null)];
  for (let day = 1; day <= days; day += 1) cells.push(toIso(new Date(Date.UTC(year, month, day))));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}
