import { useEffect, useState } from 'react';
import type { InstallmentRow } from '../types';
import { api, errorMessage } from '../api';
import type { AccountDetail, Transaction } from '../types';
import { formatCOP, formatLongDay } from '../utils/format';
import { monthlyInterest } from '../utils/interest';
import SummaryCard from '../components/SummaryCard';

interface AccountDetailPageProps {
  accountId: number;
  month: string;
  onBack: () => void;
}

const KIND_LABEL = { credit_card: 'Tarjeta de crédito', loan: 'Préstamo', personal: 'Deuda con una persona' } as const;
const TYPE_STYLE = {
  income: { text: 'Ingreso', className: 'bg-green-100 text-green-700', sign: '+' },
  expense: { text: 'Gasto', className: 'bg-red-100 text-red-700', sign: '−' },
  payment: { text: 'Abono', className: 'bg-blue-100 text-blue-700', sign: '→ ' }
} as const;
const th = 'px-3 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap';
const td = 'px-3 py-2 text-sm whitespace-nowrap';

function LinkedPurchase({ tx }: { tx: Transaction }): JSX.Element {
  if (!tx.linked_purchase) return <span className="text-gray-400">Sin cruzar</span>;
  const p = tx.linked_purchase;
  return (
    <span className="text-blue-700">
      {p.description} · compra del {formatLongDay(p.purchase_date)} · valor {formatCOP(p.original_value)}
    </span>
  );
}

export default function AccountDetailPage({ accountId, month, onBack }: AccountDetailPageProps): JSX.Element {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [error, setError] = useState('');
  const [onlyPending, setOnlyPending] = useState(true);
  const [rateFilter, setRateFilter] = useState<'all' | 'interest' | 'free'>('all');

  useEffect(() => {
    let cancelled = false;
    api
      .accountDetail(accountId, month)
      .then(d => !cancelled && setDetail(d))
      .catch(err => !cancelled && setError(errorMessage(err, 'No se pudo cargar la tarjeta')));
    return () => {
      cancelled = true;
    };
  }, [accountId, month]);

  const back = (
    <button onClick={onBack} className="text-sm text-blue-700 hover:underline">← Todas las tarjetas</button>
  );
  if (error) return <div className="space-y-4">{back}<div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div></div>;
  if (!detail) return <div className="space-y-4">{back}<p className="text-gray-500">Cargando…</p></div>;

  const { account, installments, directed_payments: directed, movements } = detail;
  const all = installments?.rows ?? [];
  const pending = all.filter(r => r.balance_after > 0);
  const withInterest = pending.filter(r => r.rate > 0);
  const interestFree = pending.filter(r => r.rate === 0);
  const sumBalance = (list: InstallmentRow[]): number => list.reduce((t, r) => t + r.balance_after, 0);
  const estimatedInterest = withInterest.reduce((t, r) => t + monthlyInterest(r), 0);
  const rows = all
    .filter(r => !onlyPending || r.balance_after > 0)
    .filter(r => rateFilter === 'all' || (rateFilter === 'interest' ? r.rate > 0 : r.rate === 0))
    .sort((a, b) => (rateFilter === 'interest' ? monthlyInterest(b) - monthlyInterest(a) : 0));
  const pendingTotal = (installments?.rows ?? []).reduce((t, r) => t + r.balance_after, 0);
  const capitalTotal = (installments?.rows ?? []).reduce((t, r) => t + r.capital_paid, 0);
  const used = account.credit_limit ? Math.round((account.balance / account.credit_limit) * 100) : null;

  return (
    <div className="space-y-8">
      {back}
      <div>
        <h2 className="text-2xl font-bold">{account.name}</h2>
        <p className="text-sm text-gray-600">
          {KIND_LABEL[account.kind]}
          {account.bank ? ` · ${account.bank}` : ''}
          {account.annual_rate !== null ? ` · tasa ${account.annual_rate}% E.A.` : ''}
          {account.balance_as_of ? ` · saldo tomado del extracto con corte ${formatLongDay(account.balance_as_of)}` : ''}
          {account.notes ? ` · ${account.notes}` : ''}
        </p>
        <p className="text-sm text-gray-600">
          En el año: intereses {formatCOP(account.year_interest)} · manejo, seguros y comisiones {formatCOP(account.year_fees)}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard title="Deuda" value={formatCOP(account.balance)} icon="💳" color="red" />
        <SummaryCard
          title={account.credit_limit ? `Cupo · usado ${used}%` : 'Cupo'}
          value={account.credit_limit ? formatCOP(account.credit_limit) : '—'}
          icon="📏"
          color="blue"
        />
        <SummaryCard title="Intereses del mes" value={formatCOP(account.month_interest)} icon="🏦" color="red" />
        <SummaryCard title="Manejo, seguros y comisiones del mes" value={formatCOP(account.month_fees)} icon="🧾" color="red" />
      </div>

      <section className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Compras a cuotas</h3>
            <p className="text-sm text-gray-600">
              {installments
                ? `Según el extracto con corte ${formatLongDay(installments.cutoff)}: saldo pendiente ${formatCOP(pendingTotal)}, abono a capital del mes ${formatCOP(capitalTotal)}.`
                : 'Sube un extracto PDF de esta tarjeta en Importar para ver sus compras a cuotas.'}
            </p>
          </div>
          {installments && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg" role="group" aria-label="Filtrar por interés">
                {([['all', 'Todas'], ['interest', 'Con interés'], ['free', 'Sin interés']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setRateFilter(value)}
                    aria-pressed={rateFilter === value}
                    className={`px-3 py-1 rounded-md text-sm ${rateFilter === value ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            <label className="text-sm text-gray-700 flex items-center gap-2">
              <input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />
              Solo con saldo pendiente
            </label>
            </div>
          )}
        </div>
        {installments && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 border-b bg-gray-50">
            <div className="bg-white rounded-lg border border-red-200 p-4">
              <p className="text-sm font-medium text-red-700">Con interés · {withInterest.length} compras</p>
              <p className="text-2xl font-bold text-red-700">{formatCOP(sumBalance(withInterest))}</p>
              <p className="text-xs text-gray-600 mt-1">
                Generan unos {formatCOP(estimatedInterest)} de interés al mes. Si haces abonos dirigidos, empieza por las de
                más interés (filtro "Con interés").
              </p>
            </div>
            <div className="bg-white rounded-lg border border-green-200 p-4">
              <p className="text-sm font-medium text-green-700">Sin interés · {interestFree.length} compras</p>
              <p className="text-2xl font-bold text-green-700">{formatCOP(sumBalance(interestFree))}</p>
              <p className="text-xs text-gray-600 mt-1">Estas no generan interés: no hay ventaja en pagarlas antes de tiempo.</p>
            </div>
          </div>
        )}
        {installments && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className={th}>Compra</th>
                  <th className={`${th} text-right`}>Valor</th>
                  <th className={th}>Cuota</th>
                  <th className={`${th} text-right`}>Abono a capital del mes</th>
                  <th className={`${th} text-right`}>Saldo pendiente</th>
                  <th className={th}>Tasa</th>
                  <th className={`${th} text-right`}>Interés estimado/mes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.purchase_date}-${r.original_value}-${i}`} className={`border-b ${r.balance_after > 0 ? '' : 'text-gray-400'}`}>
                    <td className={td}>
                      <p className="font-medium">{r.description}</p>
                      <p className="text-xs text-gray-500">{formatLongDay(r.purchase_date)}</p>
                    </td>
                    <td className={`${td} text-right`}>{formatCOP(r.original_value)}</td>
                    <td className={td}>
                      {r.installment_no} de {r.installments_total}
                      <span className="text-xs text-gray-500"> · faltan {Math.max(r.installments_total - r.installment_no, 0)}</span>
                    </td>
                    <td className={`${td} text-right`}>{formatCOP(r.capital_paid)}</td>
                    <td className={`${td} text-right font-medium`}>{formatCOP(r.balance_after)}</td>
                    <td className={td}>
                      {r.rate > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{r.rate}% E.A.</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Sin interés</span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>{r.rate > 0 && r.balance_after > 0 ? formatCOP(monthlyInterest(r)) : '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td className="px-3 py-4 text-sm text-gray-500" colSpan={7}>No hay compras para este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {directed.total > 0 && (
        <section className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 border-b">
            <h3 className="text-lg font-bold">Abonos dirigidos a compras</h3>
            <p className="text-sm text-gray-600">
              {directed.linked} de {directed.total} cruzados con la compra que pagaron. Los que no se cruzan necesitan el
              extracto anterior a la fecha del abono.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className={th}>Fecha</th>
                  <th className={th}>Abono</th>
                  <th className={`${th} text-right`}>Valor</th>
                  <th className={th}>Compra que pagó</th>
                </tr>
              </thead>
              <tbody>
                {directed.items.map(tx => (
                  <tr key={tx.id} className="border-b">
                    <td className={td}>{formatLongDay(tx.date)}</td>
                    <td className={td}>{tx.description}</td>
                    <td className={`${td} text-right`}>{formatCOP(tx.amount_cop)}</td>
                    <td className={td}><LinkedPurchase tx={tx} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="text-lg font-bold">Movimientos de la tarjeta</h3>
          <p className="text-sm text-gray-600">{movements.length} movimientos registrados en la app.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Descripción</th>
                <th className={th}>Tipo</th>
                <th className={`${th} text-right`}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(tx => {
                const style = TYPE_STYLE[tx.type];
                return (
                  <tr key={tx.id} className="border-b">
                    <td className={td}>{formatLongDay(tx.date)}</td>
                    <td className="px-3 py-2 text-sm">
                      <p>{tx.description}</p>
                      {tx.category_name && <p className="text-xs text-gray-500">{tx.category_name}</p>}
                      {tx.linked_purchase && <p className="text-xs"><LinkedPurchase tx={tx} /></p>}
                    </td>
                    <td className={td}><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.className}`}>{style.text}</span></td>
                    <td className={`${td} text-right`}>{style.sign}{formatCOP(tx.amount_cop)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
