import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import type { Subscription, SubscriptionsResponse } from '../types';
import { formatCOP, formatDay, monthLabel } from '../utils/format';
import SummaryCard from '../components/SummaryCard';

interface SubscriptionsPageProps {
  /** Reloads the list when the movements change. */
  refreshKey: unknown;
}

const th = 'px-4 py-3 text-left text-sm font-medium text-gray-700 whitespace-nowrap';
const td = 'px-4 py-3 text-sm text-gray-900 whitespace-nowrap';

export default function SubscriptionsPage({ refreshKey }: SubscriptionsPageProps): JSX.Element {
  const [data, setData] = useState<SubscriptionsResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newAmount, setNewAmount] = useState<string>('');

  const load = useCallback(async (): Promise<void> => {
    try {
      setData(await api.subscriptions());
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron cargar las suscripciones'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const mark = async (sub: Subscription, status: 'keep' | 'cancel'): Promise<void> => {
    try {
      // Pressing the active button again clears the decision.
      await api.markSubscription(sub.key, sub.status === status ? null : status);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar tu decisión'));
    }
  };

  const addManual = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const amount = Number(newAmount.replace(/[^\d]/g, ''));
    if (!newName.trim() || amount <= 0) {
      setError('Escribe el nombre y cuánto cobran al mes.');
      return;
    }
    try {
      await api.addManualSubscription(newName.trim(), amount);
      setNewName('');
      setNewAmount('');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la suscripción'));
    }
  };

  const removeManual = async (id: number): Promise<void> => {
    if (!window.confirm('¿Quitar esta suscripción de la lista?')) return;
    try {
      await api.deleteManualSubscription(id);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo quitar la suscripción'));
    }
  };

  if (!data) {
    return <div className="text-center py-8 text-gray-500">{error || 'Cargando…'}</div>;
  }

  const { subscriptions, totals } = data;
  const buttonClass = (active: boolean, activeColor: string): string =>
    `px-2.5 py-1 rounded-md border text-xs font-medium ${
      active ? activeColor : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="Suscripciones al mes" value={formatCOP(totals.monthly)} icon="🔁" color="red" />
        <SummaryCard title="Suscripciones al año" value={formatCOP(totals.yearly)} icon="📆" color="red" />
        <SummaryCard
          title="Ahorras al año si cancelas las marcadas"
          value={formatCOP(totals.cancel_yearly)}
          icon="✂️"
          color="green"
        />
      </div>

      <form onSubmit={e => void addManual(e)} className="bg-white p-6 rounded-lg shadow-md flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-48">
          <label htmlFor="sub-name" className="block text-sm font-medium text-gray-700 mb-1">Anotar una suscripción a mano</label>
          <input id="sub-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Uber One"
            className="w-full px-3 py-2 border border-gray-300 rounded-md" />
        </div>
        <div>
          <label htmlFor="sub-amount" className="block text-sm font-medium text-gray-700 mb-1">Cobro al mes (COP)</label>
          <input id="sub-amount" value={newAmount} onChange={e => setNewAmount(e.target.value)} inputMode="numeric" placeholder="31862"
            className="w-40 px-3 py-2 border border-gray-300 rounded-md" />
        </div>
        <button type="submit" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium">
          Agregar
        </button>
      </form>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Cobros que se repiten cada mes</h2>
          <p className="text-sm text-gray-600">
            La app los detecta sola a partir de tus movimientos: el mismo comercio en dos o más meses y con montos
            parecidos. Marca <strong>Cancelar</strong> los que quieras cortar y mira cuánto ahorras.
          </p>
        </div>
        {subscriptions.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">
            Todavía no hay cobros repetidos. Aparecen cuando hay al menos dos meses de movimientos del mismo comercio;
            importa más extractos para verlos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className={th}>Comercio</th>
                  <th className={th}>Monto típico</th>
                  <th className={th}>Meses</th>
                  <th className={th}>Último cobro</th>
                  <th className={th}>Al año</th>
                  <th className={th}>Decisión</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(sub => (
                  <tr key={sub.key} className={`border-b ${sub.status === 'cancel' ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <td className={td}>
                      <span className={`font-medium ${sub.status === 'cancel' ? 'line-through text-gray-500' : ''}`}>{sub.name}</span>
                      {sub.possible_duplicate && (
                        <p className="text-xs text-amber-700">⚠️ Dos cobros casi iguales en pocos días: revísalo con el comercio.</p>
                      )}
                    </td>
                    <td className={td}>{formatCOP(sub.typical_amount)}</td>
                    <td className={td} title={sub.months.map(monthLabel).join(', ')}>
                      {sub.manual_id !== undefined ? 'a mano' : sub.months.length}
                    </td>
                    <td className={td}>{sub.last_date ? formatDay(sub.last_date) : '—'}</td>
                    <td className={`${td} text-red-600`}>{formatCOP(sub.annual_cost)}</td>
                    <td className={td}>
                      <div className="flex gap-2">
                        <button onClick={() => void mark(sub, 'keep')} className={buttonClass(sub.status === 'keep', 'border-green-600 bg-green-50 text-green-700')}>
                          Conservar
                        </button>
                        <button onClick={() => void mark(sub, 'cancel')} className={buttonClass(sub.status === 'cancel', 'border-red-600 bg-red-50 text-red-700')}>
                          Cancelar
                        </button>
                        {sub.manual_id !== undefined && (
                          <button onClick={() => void removeManual(sub.manual_id as number)} className="text-xs text-gray-400 hover:text-red-600">
                            Quitar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
