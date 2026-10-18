import { useEffect, useState } from 'react';
import { api } from '../api';
import type { CardInstallments, InstallmentRow } from '../types';
import { formatCOP, formatLongDay } from '../utils/format';
import { monthlyInterest } from '../utils/interest';
import ExtraPaymentPlanner from './ExtraPaymentPlanner';

interface InterestBreakdownProps {
  refreshKey?: unknown;
  onOpen: (accountId: number) => void;
}

type Row = InstallmentRow & { account_id: number; account_name: string };
const th = 'px-3 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap';
const td = 'px-3 py-2 text-sm whitespace-nowrap';
const sumBalance = (rows: InstallmentRow[]): number => rows.reduce((t, r) => t + r.balance_after, 0);
const sumInterest = (rows: InstallmentRow[]): number => rows.reduce((t, r) => t + monthlyInterest(r), 0);

export default function InterestBreakdown({ refreshKey, onOpen }: InterestBreakdownProps): JSX.Element | null {
  const [cards, setCards] = useState<CardInstallments[] | null>(null);
  const [view, setView] = useState<'none' | 'interest' | 'free'>('none');

  useEffect(() => {
    api.installmentsByCard().then(setCards).catch(() => setCards([]));
  }, [refreshKey]);

  if (!cards || cards.length === 0) return null;

  const perCard = cards.map(c => {
    const pending = c.rows.filter(r => r.balance_after > 0);
    return { ...c, withInterest: pending.filter(r => r.rate > 0), free: pending.filter(r => r.rate === 0) };
  });
  const all: Row[] = perCard.flatMap(c =>
    [...c.withInterest, ...c.free].map(r => ({ ...r, account_id: c.account_id, account_name: c.account_name }))
  );
  const allInterest = all.filter(r => r.rate > 0).sort((a, b) => monthlyInterest(b) - monthlyInterest(a));
  const allFree = all.filter(r => r.rate === 0).sort((a, b) => b.balance_after - a.balance_after);
  const listed = view === 'interest' ? allInterest : view === 'free' ? allFree : [];

  return (
    <section className="bg-white rounded-lg shadow-md overflow-hidden" aria-labelledby="interest-title">
      <div className="p-6 border-b">
        <h2 id="interest-title" className="text-xl font-bold">Compras con interés y sin interés</h2>
        <p className="text-sm text-gray-600">
          Según el último extracto cargado de cada tarjeta. Cada compra conserva la tasa que tenía cuando la hiciste.
        </p>
      </div>

      <ExtraPaymentPlanner cards={cards} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-gray-50 border-b">
        <button
          onClick={() => setView(view === 'interest' ? 'none' : 'interest')}
          aria-pressed={view === 'interest'}
          className={`text-left bg-white rounded-lg border-2 p-4 ${view === 'interest' ? 'border-red-500' : 'border-red-200'}`}
        >
          <p className="text-sm font-medium text-red-700">Con interés · {allInterest.length} compras</p>
          <p className="text-3xl font-bold text-red-700">{formatCOP(sumBalance(allInterest))}</p>
          <p className="text-sm text-gray-700">≈ {formatCOP(sumInterest(allInterest))} de interés al mes</p>
          <p className="text-xs text-blue-700 mt-1">{view === 'interest' ? 'Ocultar lista' : 'Ver todas, de la más cara a la más barata'}</p>
        </button>
        <button
          onClick={() => setView(view === 'free' ? 'none' : 'free')}
          aria-pressed={view === 'free'}
          className={`text-left bg-white rounded-lg border-2 p-4 ${view === 'free' ? 'border-green-500' : 'border-green-200'}`}
        >
          <p className="text-sm font-medium text-green-700">Sin interés (tasa 0%) · {allFree.length} compras</p>
          <p className="text-3xl font-bold text-green-700">{formatCOP(sumBalance(allFree))}</p>
          <p className="text-sm text-gray-700">No generan interés</p>
          <p className="text-xs text-blue-700 mt-1">{view === 'free' ? 'Ocultar lista' : 'Ver todas'}</p>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className={th}>Tarjeta</th>
              <th className={`${th} text-right`}>Con interés</th>
              <th className={`${th} text-right`}>Saldo con interés</th>
              <th className={`${th} text-right`}>Interés/mes aprox.</th>
              <th className={`${th} text-right`}>Sin interés</th>
              <th className={`${th} text-right`}>Saldo sin interés</th>
            </tr>
          </thead>
          <tbody>
            {perCard.map(c => (
              <tr key={c.account_id} className="border-b hover:bg-gray-50">
                <td className={td}>
                  <button onClick={() => onOpen(c.account_id)} className="font-medium text-blue-700 hover:underline">
                    {c.account_name} →
                  </button>
                  <p className="text-xs text-gray-500">extracto con corte {formatLongDay(c.cutoff)}</p>
                </td>
                <td className={`${td} text-right`}>{c.withInterest.length}</td>
                <td className={`${td} text-right text-red-700 font-medium`}>{formatCOP(sumBalance(c.withInterest))}</td>
                <td className={`${td} text-right text-red-700`}>{formatCOP(sumInterest(c.withInterest))}</td>
                <td className={`${td} text-right`}>{c.free.length}</td>
                <td className={`${td} text-right text-green-700 font-medium`}>{formatCOP(sumBalance(c.free))}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className={td}>Total</td>
              <td className={`${td} text-right`}>{allInterest.length}</td>
              <td className={`${td} text-right text-red-700`}>{formatCOP(sumBalance(allInterest))}</td>
              <td className={`${td} text-right text-red-700`}>{formatCOP(sumInterest(allInterest))}</td>
              <td className={`${td} text-right`}>{allFree.length}</td>
              <td className={`${td} text-right text-green-700`}>{formatCOP(sumBalance(allFree))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {listed.length > 0 && (
        <div className="overflow-x-auto border-t">
          <h3 className="px-6 pt-4 font-bold">
            {view === 'interest' ? 'Compras con interés, de la que más te cuesta a la que menos' : 'Compras sin interés'}
          </h3>
          <table className="w-full mt-2">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className={th}>Compra</th>
                <th className={th}>Tarjeta</th>
                <th className={th}>Cuota</th>
                <th className={`${th} text-right`}>Saldo</th>
                <th className={th}>Tasa E.A.</th>
                {view === 'interest' && <th className={`${th} text-right`}>Interés/mes aprox.</th>}
              </tr>
            </thead>
            <tbody>
              {listed.map((r, i) => (
                <tr key={`${r.account_id}-${r.purchase_date}-${r.original_value}-${i}`} className="border-b">
                  <td className={td}>
                    <p className="font-medium">{r.description}</p>
                    <p className="text-xs text-gray-500">{formatLongDay(r.purchase_date)} · valor {formatCOP(r.original_value)}</p>
                  </td>
                  <td className={td}>{r.account_name}</td>
                  <td className={td}>{r.installment_no} de {r.installments_total}</td>
                  <td className={`${td} text-right font-medium`}>{formatCOP(r.balance_after)}</td>
                  <td className={td}>{r.rate > 0 ? `${r.rate}%` : '0%'}</td>
                  {view === 'interest' && <td className={`${td} text-right text-red-700`}>{formatCOP(monthlyInterest(r))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
