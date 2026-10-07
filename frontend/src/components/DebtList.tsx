import type { Debt } from '../types';
import { formatCOP } from '../utils/format';

interface DebtListProps {
  debts: Debt[];
  onDelete: (id: number) => void;
}

const th = 'px-6 py-3 text-left text-sm font-medium text-gray-700';
const td = 'px-6 py-3 text-sm text-gray-900';

export default function DebtList({ debts, onDelete }: DebtListProps): JSX.Element {
  if (debts.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center text-gray-500">
        <p>Aún no tienes deudas registradas.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <h2 className="text-xl font-bold p-6 border-b">Deudas activas</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className={th}>Nombre</th>
              <th className={th}>Saldo</th>
              <th className={th}>Tasa</th>
              <th className={th}>Pago mínimo</th>
              <th className={th}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {debts.map(debt => (
              <tr key={debt.id} className="border-b hover:bg-gray-50">
                <td className={td}>{debt.name}</td>
                <td className={td}>{formatCOP(debt.amount)}</td>
                <td className={td}>{debt.interest_rate}%</td>
                <td className={td}>{formatCOP(debt.min_payment ?? 0)}</td>
                <td className="px-6 py-3 text-sm">
                  <button onClick={() => onDelete(debt.id)} className="text-red-600 hover:text-red-800 font-medium">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
