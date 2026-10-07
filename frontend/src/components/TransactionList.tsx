import type { Transaction } from '../types';
import { formatCOP, formatDay, formatUSD } from '../utils/format';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: number) => void;
}

export default function TransactionList({ transactions, onDelete }: TransactionListProps): JSX.Element {
  if (transactions.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center text-gray-500">
        No hay movimientos en este mes. Agrega el primero.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <h2 className="text-xl font-bold p-6 border-b">Movimientos</h2>
      <ul className="divide-y">
        {transactions.map(tx => {
          const isIncome = tx.type === 'income';
          return (
            <li key={tx.id} className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-gray-50">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{tx.description}</p>
                <p className="text-xs text-gray-500">
                  {formatDay(tx.date)} · {tx.category_name ?? 'Sin categoría'}
                  {tx.original_currency === 'USD' &&
                    ` · ${formatUSD(tx.original_amount)} a ${formatCOP(tx.exchange_rate)}`}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className={`font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                  {isIncome ? '+' : '−'}{formatCOP(tx.amount_cop)}
                </span>
                <button
                  onClick={() => onDelete(tx.id)}
                  className="text-sm text-gray-400 hover:text-red-600"
                  aria-label={`Eliminar ${tx.description}`}
                >
                  Eliminar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
