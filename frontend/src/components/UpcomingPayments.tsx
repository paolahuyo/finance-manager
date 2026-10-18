import { useEffect, useState } from 'react';
import { api } from '../api';
import type { UpcomingPayment } from '../types';
import { formatCOP, todayISO } from '../utils/format';

interface UpcomingPaymentsProps {
  /** Changes whenever data may have changed, so the list reloads (e.g. after a new payment). */
  refreshKey?: unknown;
}

type Status = 'paid' | 'partial' | 'pending' | 'overdue';

const STYLE: Record<Status, { label: string; border: string; badge: string; date: string }> = {
  overdue: { label: 'Vencido', border: 'border-red-600', badge: 'bg-red-600 text-white', date: 'text-red-600' },
  pending: { label: 'Pendiente', border: 'border-amber-500', badge: 'bg-amber-100 text-amber-800', date: 'text-gray-900' },
  partial: { label: 'Pago parcial', border: 'border-amber-500', badge: 'bg-amber-100 text-amber-800', date: 'text-gray-900' },
  paid: { label: 'Pagado ✓', border: 'border-green-500', badge: 'bg-green-100 text-green-800', date: 'text-gray-400' }
};

/** Next cut-off date, assuming the bank cuts on the same day every month. */
function nextCutoff(cutoff: string | null, today: string): string | null {
  if (!cutoff) return null;
  const day = Number(cutoff.slice(8, 10));
  let [y, m] = today.split('-').map(Number);
  for (let i = 0; i < 2; i++) {
    const last = new Date(y, m, 0).getDate();
    const candidate = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
    if (candidate >= today) return candidate;
    m = m === 12 ? 1 : m + 1;
    if (m === 1) y++;
  }
  return null;
}

const shortDate = (iso: string): { day: number; month: string } => {
  const [y, m, d] = iso.split('-').map(Number);
  return { day: d, month: new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(new Date(y, m - 1, d)).replace('.', '') };
};

const dayDiff = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function statusOf(p: UpcomingPayment, today: string): Status {
  const min = p.minimum_payment ?? 0;
  if (min > 0 && p.paid_since_cutoff >= min - 0.01) return 'paid';
  if (today > p.due_date) return 'overdue';
  return p.paid_since_cutoff > 0 ? 'partial' : 'pending';
}

function whenText(days: number, status: Status): string {
  if (status === 'paid') return 'Ya pagaste el mínimo';
  if (days === 0) return '¡Vence HOY!';
  if (days === 1) return 'Vence mañana';
  if (days > 1) return `Faltan ${days} días`;
  return `Venció hace ${-days} día${days === -1 ? '' : 's'}`;
}

export default function UpcomingPayments({ refreshKey }: UpcomingPaymentsProps): JSX.Element | null {
  const [payments, setPayments] = useState<UpcomingPayment[] | null>(null);

  useEffect(() => {
    api.upcomingPayments().then(setPayments).catch(() => setPayments([]));
  }, [refreshKey]);

  if (!payments || payments.length === 0) return null;
  const today = todayISO();
  const order: Record<Status, number> = { overdue: 0, pending: 1, partial: 1, paid: 2 };
  const sorted = [...payments].sort(
    (a, b) => order[statusOf(a, today)] - order[statusOf(b, today)] || a.due_date.localeCompare(b.due_date)
  );
  const toPay = sorted.filter(p => statusOf(p, today) !== 'paid');
  const totalMin = toPay.reduce((t, p) => t + Math.max((p.minimum_payment ?? 0) - p.paid_since_cutoff, 0), 0);

  return (
    <section aria-labelledby="upcoming-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="upcoming-title" className="text-2xl font-bold">📅 Próximos pagos y cortes</h2>
          <p className="text-xs text-gray-600">Lo que compres después del corte pasa al extracto siguiente.</p>
        </div>
        <p className="text-sm text-gray-700">
          {toPay.length > 0 ? (
            <>Por pagar: <strong>{toPay.length}</strong> tarjeta{toPay.length === 1 ? '' : 's'} · mínimo total <strong>{formatCOP(totalMin)}</strong></>
          ) : (
            'Todo al día ✓'
          )}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sorted.map(p => {
          const status = statusOf(p, today);
          const style = STYLE[status];
          const [year, month, day] = p.due_date.split('-').map(Number);
          const date = new Date(year, month - 1, day);
          const monthName = new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(date).replace('.', '');
          const weekday = new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(date);
          const days = dayDiff(today, p.due_date);
          const remaining = Math.max((p.minimum_payment ?? 0) - p.paid_since_cutoff, 0);
          const nextCut = nextCutoff(p.due_cutoff, today);
          const cutoff = nextCut ? shortDate(nextCut) : null;
          const cutoffDay = p.due_cutoff ? Number(p.due_cutoff.slice(8, 10)) : null;
          return (
            <article
              key={p.id}
              className={`bg-white rounded-xl shadow-md border-l-8 ${style.border} p-5 ${status === 'paid' ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap ${style.badge}`}>{style.label}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className={`leading-none ${style.date}`}>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Pagar antes de</p>
                  <span className="text-5xl font-extrabold tracking-tight">{day}</span>
                  <span className="ml-1 text-xl font-bold uppercase">{monthName}</span>
                  <p className="text-sm font-medium capitalize mt-1">{weekday}</p>
                </div>
                {cutoff && (
                  <div className="leading-none border-l pl-2 text-indigo-700">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Corte</p>
                    <span className="text-5xl font-extrabold tracking-tight">{cutoff.day}</span>
                    <span className="ml-1 text-xl font-bold uppercase">{cutoff.month}</span>
                    <p className="text-sm font-medium mt-1">Día {cutoffDay} de cada mes</p>
                  </div>
                )}
              </div>
              <p className={`mt-2 text-base font-bold ${status === 'overdue' || (status !== 'paid' && days <= 3) ? 'text-red-600' : 'text-gray-700'}`}>
                {whenText(days, status)}
              </p>
              <p className="mt-3 font-semibold text-gray-900">{p.name}</p>
              <p className="text-sm text-gray-600">
                Mínimo <span className="text-lg font-bold text-gray-900">{formatCOP(p.minimum_payment ?? 0)}</span>
              </p>
              {status === 'partial' && <p className="text-sm text-amber-700">Te falta {formatCOP(remaining)}</p>}
              {p.total_payment !== null && <p className="text-xs text-gray-500">Pago total {formatCOP(p.total_payment)}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
