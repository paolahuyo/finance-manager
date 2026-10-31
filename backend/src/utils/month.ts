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

/** Moves a 'YYYY-MM' month by `delta` months (negative goes back). */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(year, mon - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** A fixed monthly item only applies from the month it was created, never to earlier months. */
export function appliesInMonth(sinceMonth: string, month: string): boolean {
  return month >= sinceMonth;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
