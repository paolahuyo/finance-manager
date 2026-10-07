import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import type { Debt } from '../types';
import { formatCOP } from '../utils/format';
import DebtForm, { DebtFormData } from '../components/DebtForm';
import DebtList from '../components/DebtList';
import SummaryCard from '../components/SummaryCard';

export default function DebtDashboard(): JSX.Element {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const loadDebts = async (): Promise<void> => {
    try {
      setDebts(await api.debts());
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cargar las deudas'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDebts();
  }, []);

  const handleAdd = async (data: DebtFormData): Promise<void> => {
    try {
      await api.createDebt({ ...data });
      await loadDebts();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo agregar la deuda'));
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    if (!window.confirm('¿Eliminar esta deuda?')) return;
    try {
      await api.deleteDebt(id);
      await loadDebts();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar la deuda'));
    }
  };

  const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
  const totalMinPayments = debts.reduce((sum, d) => sum + (d.min_payment ?? 0), 0);

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="Deuda total" value={formatCOP(totalDebt)} icon="💳" color="red" />
        <SummaryCard title="Número de deudas" value={debts.length} icon="📊" color="blue" />
        <SummaryCard title="Pagos mínimos al mes" value={formatCOP(totalMinPayments)} icon="🗓️" color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <DebtForm onSubmit={handleAdd} />
        </div>
        <div className="lg:col-span-2">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando…</div>
          ) : (
            <DebtList debts={debts} onDelete={handleDelete} />
          )}
        </div>
      </div>
    </div>
  );
}
