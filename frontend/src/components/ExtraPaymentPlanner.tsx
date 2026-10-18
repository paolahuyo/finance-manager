import { useState } from 'react';
import type { CardInstallments, InstallmentRow } from '../types';
import { formatCOP, formatLongDay } from '../utils/format';

interface ExtraPaymentPlannerProps {
  cards: CardInstallments[];
}

type Row = InstallmentRow & { account_name: string };
const monthlyRate = (r: InstallmentRow): number => Math.pow(1 + r.rate / 100, 1 / 12) - 1;
const td = 'px-3 py-2 text-sm whitespace-nowrap';
const th = 'px-3 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap';

/**
 * Splits an extra payment over purchases with interest, highest rate first. At the same rate,
 * 'finish' takes the smallest balances (closes many purchases) and 'fewer' the largest (few transfers).
 */
export function allocateExtra(
  rows: Row[],
  amount: number,
  strategy: 'finish' | 'fewer' = 'finish'
): { row: Row; pay: number; saving: number }[] {
  const ordered = rows
    .filter(r => r.rate > 0 && r.balance_after > 0)
    .sort((a, b) =>
      b.rate - a.rate || (strategy === 'finish' ? a.balance_after - b.balance_after : b.balance_after - a.balance_after)
    );
  const plan: { row: Row; pay: number; saving: number }[] = [];
  let left = amount;
  for (const row of ordered) {
    if (left <= 0) break;
    const pay = Math.min(left, row.balance_after);
    plan.push({ row, pay, saving: pay * monthlyRate(row) });
    left -= pay;
  }
  return plan;
}

export default function ExtraPaymentPlanner({ cards }: ExtraPaymentPlannerProps): JSX.Element {
  const [amount, setAmount] = useState('');
  const [strategy, setStrategy] = useState<'finish' | 'fewer'>('fewer');
  const rows: Row[] = cards.flatMap(c => c.rows.map(r => ({ ...r, account_name: c.account_name })));
  const value = Number(amount) || 0;
  const plan = value > 0 ? allocateExtra(rows, value, strategy) : [];
  const saving = plan.reduce((t, p) => t + p.saving, 0);
  const used = plan.reduce((t, p) => t + p.pay, 0);
  const paidOff = plan.filter(p => p.pay >= p.row.balance_after - 0.01).length;

  return (
    <div className="p-6 border-b space-y-4">
      <div>
        <h3 className="text-lg font-bold">💸 Planear un abono extra</h3>
        <p className="text-sm text-gray-600">
          Escribe cuánto quieres abonar de más y te digo a qué compras con interés dirigirlo, empezando por la tasa
          más alta.
        </p>
      </div>
      <label className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Monto a abonar</span>
        <input
          type="number"
          min="0"
          step="1000"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Ej: 1000000"
          className="px-3 py-2 border border-gray-300 rounded-md w-48 text-lg"
        />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cómo repartir el abono">
        {([['fewer', 'Pocos abonos grandes'], ['finish', 'Terminar muchas compras']] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStrategy(value)}
            aria-pressed={strategy === value}
            className={`px-3 py-1.5 rounded-md text-sm border ${strategy === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-gray-500 self-center">Ambos van primero a la tasa más alta; el ahorro es casi igual.</span>
      </div>

      {plan.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-sm text-green-800">Dejas de pagar en intereses</p>
              <p className="text-2xl font-bold text-green-700">≈ {formatCOP(saving)} al mes</p>
            </div>
            <div className="rounded-lg bg-gray-50 border p-3">
              <p className="text-sm text-gray-700">Compras que terminas de pagar</p>
              <p className="text-2xl font-bold">{paidOff} de {plan.length}</p>
            </div>
            <div className="rounded-lg bg-gray-50 border p-3">
              <p className="text-sm text-gray-700">Monto aplicado</p>
              <p className="text-2xl font-bold">{formatCOP(used)}</p>
              {used < value - 0.01 && <p className="text-xs text-gray-500">Sobran {formatCOP(value - used)}: ya no quedan compras con interés.</p>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className={th}>Abona a</th>
                  <th className={th}>Tarjeta</th>
                  <th className={th}>Tasa E.A.</th>
                  <th className={`${th} text-right`}>Saldo</th>
                  <th className={`${th} text-right`}>Abonar</th>
                  <th className={`${th} text-right`}>Interés que evitas/mes</th>
                </tr>
              </thead>
              <tbody>
                {plan.map(({ row, pay, saving: s }, i) => (
                  <tr key={`${row.account_name}-${row.purchase_date}-${row.original_value}-${i}`} className="border-b">
                    <td className={td}>
                      <p className="font-medium">{row.description}</p>
                      <p className="text-xs text-gray-500">compra del {formatLongDay(row.purchase_date)}</p>
                    </td>
                    <td className={td}>{row.account_name}</td>
                    <td className={td}>{row.rate}%</td>
                    <td className={`${td} text-right`}>{formatCOP(row.balance_after)}</td>
                    <td className={`${td} text-right font-bold`}>
                      {formatCOP(pay)}
                      {pay >= row.balance_after - 0.01 && <span className="ml-1 text-xs text-green-700">(la terminas)</span>}
                    </td>
                    <td className={`${td} text-right text-green-700`}>{formatCOP(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">
            En BBVA haz el abono como "pago a compra específica". En otros bancos pide que el excedente vaya a capital.
            Los saldos salen del último extracto de cada tarjeta; si pagaste algo después, el saldo real puede ser menor.
          </p>
        </>
      )}
    </div>
  );
}
