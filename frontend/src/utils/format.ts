const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatCOP = (value: number): string => copFormatter.format(value);
export const formatUSD = (value: number): string => usdFormatter.format(value);

const pad = (n: number): string => String(n).padStart(2, '0');

/** Today as 'YYYY-MM-DD' in the user's local time zone. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const currentMonth = (): string => todayISO().slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(year, mon - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(
    new Date(year, mon - 1, 1)
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDay(isoDate: string): string {
  const [year, mon, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(
    new Date(year, mon - 1, day)
  );
}

export function formatLongDay(isoDate: string): string {
  const [year, mon, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(year, mon - 1, day)
  );
}
