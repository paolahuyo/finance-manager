import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from './api';
import type { Category, MonthSummary, Transaction, TransactionPayload } from './types';
import { currentMonth } from './utils/format';
import Header from './components/Header';
import MonthNavigator from './components/MonthNavigator';
import DebtDashboard from './pages/DebtDashboard';
import SummaryPage from './pages/SummaryPage';
import TransactionsPage from './pages/TransactionsPage';

type Tab = 'summary' | 'transactions' | 'debts';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'transactions', label: 'Movimientos' },
  { id: 'debts', label: 'Deudas' }
];

function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('summary');
  const [month, setMonth] = useState<string>(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    api.categories().then(setCategories).catch(() => setError('No se pudieron cargar las categorías'));
  }, []);

  const loadMonth = useCallback(async (target: string): Promise<{ txs: Transaction[]; sum: MonthSummary }> => {
    const [txs, sum] = await Promise.all([api.transactions(target), api.summary(target)]);
    return { txs, sum };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadMonth(month)
      .then(({ txs, sum }) => {
        if (cancelled) return;
        setTransactions(txs);
        setSummary(sum);
        setError('');
      })
      .catch(() => !cancelled && setError('No se pudieron cargar los datos del mes'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month, loadMonth]);

  const refresh = async (): Promise<void> => {
    const { txs, sum } = await loadMonth(month);
    setTransactions(txs);
    setSummary(sum);
  };

  const handleCreate = async (payload: TransactionPayload): Promise<void> => {
    try {
      await api.createTransaction(payload);
      setError('');
      // Show the month the entry belongs to, so it never "disappears" after saving.
      const entryMonth = payload.date.slice(0, 7);
      if (entryMonth !== month) setMonth(entryMonth);
      else await refresh();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el movimiento'));
      throw err;
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    if (!window.confirm('¿Eliminar este movimiento?')) return;
    try {
      await api.deleteTransaction(id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar el movimiento'));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <nav className="flex gap-1 bg-gray-200 p-1 rounded-lg" aria-label="Secciones">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`px-4 py-1.5 rounded-md text-sm font-medium ${
                  tab === id ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab !== 'debts' && <MonthNavigator month={month} onChange={setMonth} />}
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {tab === 'summary' && <SummaryPage summary={summary} loading={loading} />}
        {tab === 'transactions' && (
          <TransactionsPage
            categories={categories}
            transactions={transactions}
            loading={loading}
            onCreate={handleCreate}
            onDelete={handleDelete}
          />
        )}
        {tab === 'debts' && <DebtDashboard />}
      </main>
    </div>
  );
}

export default App;
