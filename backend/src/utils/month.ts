const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_RE.test(value);
}

/** [start, end) as 'YYYY-MM-DD' for a 'YYYY-MM' month. */
export function monthRange(month: string): { start: string; end: string } {
  const [year, mon] = month.split('-').map(Number);
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMon = mon === 12 ? 1 : mon + 1;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return { start: `${year}-${pad(mon)}-01`, end: `${nextYear}-${pad(nextMon)}-01` };
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
