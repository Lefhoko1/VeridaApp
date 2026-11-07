const CURRENCY_SYMBOLS: Record<string, string> = { BWP: 'P', ZAR: 'R', USD: '$' };

function grouped(value: number, minimumFractionDigits: number, maximumFractionDigits: number): string {
  return value.toLocaleString('en', { minimumFractionDigits, maximumFractionDigits });
}

export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const sign = amount < 0 ? '-' : '';
  return `${sign}${symbol}${grouped(Math.abs(amount), 2, 2)}`;
}

export function formatQuantity(value: number): string {
  return grouped(value, 0, 3);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Dates are handled as YYYY-MM-DD strings, so no timezone can shift a business day.
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''} ${year}`;
}

export function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  return `${MONTHS[Number(month) - 1] ?? ''} ${year?.slice(2) ?? ''}`;
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}
