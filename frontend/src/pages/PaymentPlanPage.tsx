import { useEffect, useState, FormEvent } from 'react';
import { api, errorMessage } from '../api';
import type { Account, CardInstallments, PaymentPlan, PlanExtraIncome, PlanStep, PlanStrategy } from '../types';
import { currentMonth, formatCOP, formatLongDay, todayISO } from '../utils/format';

interface PaymentPlanPageProps {
  /** Reloads the month data after a payment is registered. */
  onChanged: () => Promise<void>;
}

interface ExtraDraft {
  description: string;
  amount: string;
  date: string;
  target: string; // "accountId|description" or ''
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const th = 'px-3 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap';

/** Registers a step as a payment; fixed, reserve and free steps record nothing. */
const paymentOf = (step: PlanStep): { description: string } | null => {
  if (!step.account_id) return null;
  if (step.kind === 'minimum') return { description: `Pago mínimo — ${step.account_name}` };
  if (step.kind === 'directed') return { description: `PAGO COMPRA ESPECIF. — ${step.purchase?.description ?? ''}` };
  if (step.kind === 'extra_capital') return { description: `Abono a capital — ${step.account_name}` };
  return null;
};

function stepTitle(step: PlanStep): string {
  switch (step.kind) {
    case 'minimum': return `${step.account_name} — mínimo`;
    case 'fixed': return step.note ?? 'Gasto fijo';
    case 'reserve': return 'Reserva compras a 1 cuota';
    case 'free': return 'Libre';
    case 'extra_capital': return `${step.account_name} — abono a capital`;
    default: return `${step.account_name} — ${step.purchase?.description}`;
  }
}

export default function PaymentPlanPage({ onChanged }: PaymentPlanPageProps): JSX.Element {
  const [cashNow, setCashNow] = useState('');
  const [reserve, setReserve] = useState('');
  const [strategy, setStrategy] = useState<PlanStrategy>('fewer');
  const [extras, setExtras] = useState<ExtraDraft[]>([]);
  const [cards, setCards] = useState<CardInstallments[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.installmentsByCard().then(setCards).catch(() => undefined);
    api.accounts(currentMonth()).then(setAccounts).catch(() => undefined);
    api.suggestedReserve(todayISO()).then(v => setReserve(String(v))).catch(() => undefined);
  }, []);

  // Interest-bearing purchases of cards that allow directed payments can be a target.
  const directedIds = new Set(accounts.filter(a => a.allows_directed_payments).map(a => a.id));
  const targets = cards
    .filter(c => directedIds.has(c.account_id))
    .flatMap(c => c.rows.filter(r => r.balance_after > 0 && r.rate > 0).map(r => ({ card: c, row: r })));

  const setExtra = (i: number, patch: Partial<ExtraDraft>): void =>
    setExtras(list => list.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const generate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    try {
      const extra_incomes: PlanExtraIncome[] = extras
        .filter(x => Number(x.amount) > 0 && x.date)
        .map(x => {
          const [id, ...rest] = x.target.split('|');
          return {
            description: x.description.trim() || 'Ingreso extra',
            amount: Number(x.amount),
            date: x.date,
            target: x.target ? { account_id: Number(id), description: rest.join('|') } : undefined
          };
        });
      setPlan(await api.paymentPlan({
        today: todayISO(),
        cash_now: Number(cashNow) || 0,
        reserve_one_installment: Number(reserve) || 0,
        extra_incomes,
        strategy
      }));
      setDone(new Set());
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'No se pudo generar el plan'));
    } finally {
      setBusy(false);
    }
  };

  const markDone = async (step: PlanStep): Promise<void> => {
    const payment = paymentOf(step);
    try {
      if (payment) {
        await api.createTransaction({
          type: 'payment', description: payment.description, amount: step.amount, currency: 'COP',
          category_id: null, account_id: step.account_id ?? null, date: step.date
        });
        await onChanged();
      }
      setDone(prev => new Set(prev).add(step.order));
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'No se pudo registrar el pago'));
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={generate} className="bg-white p-6 rounded-lg shadow-md space-y-4">
        <h2 className="text-xl font-bold">Plan de pagos</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass} htmlFor="plan-cash">Dinero disponible hoy (COP)</label>
            <input id="plan-cash" className={inputClass} type="number" min="0" step="any" required value={cashNow}
              onChange={e => setCashNow(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="plan-reserve">Reserva para compras a 1 cuota (COP)</label>
            <input id="plan-reserve" className={inputClass} type="number" min="0" step="any" value={reserve}
              onChange={e => setReserve(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">Sugerido: lo gastado con tarjeta el último mes completo.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="plan-strategy">Entre compras de igual tasa</label>
            <select id="plan-strategy" className={inputClass} value={strategy}
              onChange={e => setStrategy(e.target.value as PlanStrategy)}>
              <option value="fewer">Saldos grandes primero (menos pagos)</option>
              <option value="finish">Saldos pequeños primero (termina más compras)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Ingresos extra</h3>
            <button type="button" className="text-sm text-blue-700 hover:underline"
              onClick={() => setExtras(l => [...l, { description: '', amount: '', date: todayISO(), target: '' }])}>
              + Agregar
            </button>
          </div>
          {extras.map((x, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
              <input aria-label="Descripción" className={inputClass} placeholder="Descripción" value={x.description}
                onChange={e => setExtra(i, { description: e.target.value })} />
              <input aria-label="Monto" className={inputClass} type="number" min="0" step="any" placeholder="Monto" value={x.amount}
                onChange={e => setExtra(i, { amount: e.target.value })} />
              <input aria-label="Fecha" className={inputClass} type="date" value={x.date}
                onChange={e => setExtra(i, { date: e.target.value })} />
              <select aria-label="Compra destino" className={inputClass} value={x.target}
                onChange={e => setExtra(i, { target: e.target.value })}>
                <option value="">Sin destino fijo</option>
                {targets.map(({ card, row }) => (
                  <option key={`${card.account_id}|${row.description}`} value={`${card.account_id}|${row.description}`}>
                    {card.account_name} — {row.description} ({row.rate}%)
                  </option>
                ))}
              </select>
              <button type="button" className="text-sm text-red-600 hover:underline py-2"
                onClick={() => setExtras(l => l.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
          ))}
        </div>

        <button type="submit" disabled={busy}
          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium disabled:opacity-60">
          {busy ? 'Calculando…' : 'Generar plan'}
        </button>
      </form>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

      {plan && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {([
              ['Entradas', plan.totals.inflows], ['Mínimos', plan.totals.minimums], ['Gastos fijos', plan.totals.fixed],
              ['Reserva 1 cuota', plan.totals.reserve], ['Abonos extra', plan.totals.extra], ['Libre', plan.totals.free],
              ['Ahorro estimado / mes', plan.totals.monthly_saving]
            ] as const).map(([label, value]) => (
              <div key={label} className="bg-white rounded-lg shadow p-3">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="font-semibold">{formatCOP(value)}</div>
              </div>
            ))}
          </div>

          {plan.warnings.map((w, i) => (
            <div key={i} role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">{w}</div>
          ))}

          <div className="bg-white rounded-lg shadow-md overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>#</th><th className={th}>Fecha</th><th className={th}>Paso</th>
                  <th className={`${th} text-right`}>Monto</th><th className={th}>De dónde sale</th>
                  <th className={`${th} text-right`}>Ahorro/mes</th><th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plan.steps.map(step => (
                  <tr key={step.order} className={done.has(step.order) ? 'opacity-50' : ''}>
                    <td className="px-3 py-2 text-sm text-gray-500">{step.order}</td>
                    <td className="px-3 py-2 text-base font-bold whitespace-nowrap">{formatLongDay(step.date)}</td>
                    <td className="px-3 py-2 text-sm">
                      <div className="font-medium">{stepTitle(step)}{step.purchase ? ` (${step.purchase.rate}%)` : ''}</div>
                      <div className="text-xs text-gray-500">
                        {step.kind === 'minimum' && step.due_by && `antes del ${formatLongDay(step.due_by)}`}
                        {step.finishes_purchase && 'La termina. '}
                        {step.after_cutoff && step.due_by && (
                          <span className="text-amber-700">Después del corte ({formatLongDay(step.due_by)}). </span>
                        )}
                        {step.note && step.kind !== 'fixed' && step.note}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-semibold whitespace-nowrap">{formatCOP(step.amount)}</td>
                    <td className="px-3 py-2 text-sm whitespace-nowrap">{step.source}</td>
                    <td className="px-3 py-2 text-sm text-right whitespace-nowrap">
                      {step.monthly_saving !== undefined ? formatCOP(step.monthly_saving) : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {paymentOf(step) && (done.has(step.order)
                        ? <span className="text-green-700">Hecho ✓</span>
                        : <button onClick={() => void markDone(step)}
                            className="px-3 py-1 rounded-md bg-green-600 text-white hover:bg-green-700">Hecho</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
