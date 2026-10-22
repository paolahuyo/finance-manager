import { useEffect, useState } from 'react';
import { api } from '../api';
import type { FeeBreakdownRow } from '../types';
import { formatCOP, formatLongDay, monthLabel } from '../utils/format';

interface FeesBreakdownProps {
  month: string;
  refreshKey?: unknown;
  onOpen: (accountId: number) => void;
}

const th = 'px-3 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap';
const td = 'px-3 py-2 text-sm whitespace-nowrap';

/** Handling fees, insurance and commissions charged by each card, by type. */
export default function FeesBreakdown({ month, refreshKey, onOpen }: FeesBreakdownProps): JSX.Element | null {
  const [rows, setRows] = useState<FeeBreakdownRow[] | null>(null);

  useEffect(() => {
    api.feeBreakdown(month).then(setRows).catch(() => setRows([]));
  }, [month, refreshKey]);

  if (!rows || rows.length === 0) return null;
  const sum = (pick: (r: FeeBreakdownRow) => number): number => rows.reduce((t, r) => t + pick(r), 0);

  return (
    <section className="bg-white rounded-lg shadow-md overflow-hidden" aria-labelledby="fees-title">
      <div className="p-6 border-b">
        <h2 id="fees-title" className="text-xl font-bold">Cobros adicionales por tarjeta</h2>
        <p className="text-sm text-gray-600">
          Cuota de manejo, seguros (incluye seguro deudor) y comisiones, sin contar intereses.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className={th}>Tarjeta</th>
              <th className={th}>Concepto</th>
              <th className={`${th} text-right`}>{monthLabel(month)}</th>
              <th className={`${th} text-right`}>En el año</th>
              <th className={`${th} text-right`}>Total registrado</th>
              <th className={th}>Último cobro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.account_id}-${r.category}`} className="border-b hover:bg-gray-50">
                <td className={td}>
                  <button onClick={() => onOpen(r.account_id)} className="font-medium text-blue-700 hover:underline">
                    {r.account_name}
                  </button>
                </td>
                <td className={td}>{r.category}</td>
                <td className={`${td} text-right text-red-600`}>{formatCOP(r.month_total)}</td>
                <td className={`${td} text-right text-red-600`}>{formatCOP(r.year_total)}</td>
                <td className={`${td} text-right`}>{formatCOP(r.all_time_total)}</td>
                <td className={td}>{formatLongDay(r.last_date)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td className={td} colSpan={2}>Total</td>
              <td className={`${td} text-right`}>{formatCOP(sum(r => r.month_total))}</td>
              <td className={`${td} text-right`}>{formatCOP(sum(r => r.year_total))}</td>
              <td className={`${td} text-right`}>{formatCOP(sum(r => r.all_time_total))}</td>
              <td className={td}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
