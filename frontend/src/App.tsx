import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from './api';
import type { Account, AccountPayload, Category, MonthSummary, Transaction, TransactionPayload } from './types';
import { currentMonth } from './utils/format';
import Header from './components/Header';
import MonthNavigator from './components/MonthNavigator';
import UpcomingPayments from './components/UpcomingPayments';
import AccountsPage from './pages/AccountsPage';
import AccountDetailPage from './pages/AccountDetailPage';
import ImportPage from './pages/ImportPage';
import SummaryPage from './pages/SummaryPage';
import TransactionsPage from './pages/TransactionsPage';

type Tab = 'summary' | 'transactions' | 'accounts' | 'import';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'transactions', label: 'Movimientos' },
  { id: 'accounts', label: 'Tarjetas' },
  { id: 'import', label: 'Importar' }
];

function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('summary');
  const [month, setMonth] = useState<string>(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [openAccountId, setOpenAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    api.categories().then(setCategories).catch(() => setError('No se pudieron cargar las categorías'));
  }, []);

  const loadMonth = useCallback(async (target: string): Promise<{ txs: Transaction[]; sum: MonthSummary; accs: Account[] }> => {
    const [txs, sum, accs] = await Promise.all([
      api.transactions(target),
      api.summary(target),
      api.accounts(target)
    ]);
    return { txs, sum, accs };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadMonth(month)
      .then(({ txs, sum, accs }) => {
        if (cancelled) return;
        setTransactions(txs);
        setSummary(sum);
        setAccounts(accs);
        setError('');
      })
      .catch(() => !cancelled && setError('No se pudieron cargar los datos del mes'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month, loadMonth]);

  const refresh = async (): Promise<void> => {
    const { txs, sum, accs } = await loadMonth(month);
    setTransactions(txs);
    setSummary(sum);
    setAccounts(accs);
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

  const handleCreateAccount = async (payload: AccountPayload): Promise<void> => {
    try {
      await api.createAccount(payload);
      setError('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la tarjeta'));
      throw err;
    }
  };

  const handleDeleteAccount = async (id: number): Promise<void> => {
    if (!window.confirm('¿Eliminar esta tarjeta? Sus movimientos se conservan, pero quedan sin tarjeta.')) return;
    try {
      await api.deleteAccount(id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar la tarjeta'));
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
                onClick={() => {
                  setTab(id);
                  setOpenAccountId(null);
                }}
                aria-current={tab === id ? 'page' : undefined}
                className={`px-4 py-1.5 rounded-md text-sm font-medium ${
                  tab === id ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <MonthNavigator month={month} onChange={setMonth} />
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {(tab === 'summary' || (tab === 'accounts' && openAccountId === null)) && <UpcomingPayments refreshKey={accounts} />}
        {tab === 'summary' && <SummaryPage summary={summary} loading={loading} />}
        {tab === 'transactions' && (
          <TransactionsPage
            categories={categories}
            accounts={accounts}
            transactions={transactions}
            loading={loading}
            onCreate={handleCreate}
            onDelete={handleDelete}
          />
        )}
        {tab === 'import' && <ImportPage accounts={accounts} categories={categories} onImported={refresh} />}
        {tab === 'accounts' && openAccountId !== null && (
          <AccountDetailPage accountId={openAccountId} month={month} onBack={() => setOpenAccountId(null)} />
        )}
        {tab === 'accounts' && openAccountId === null && (
          <AccountsPage
            month={month}
            accounts={accounts}
            onCreate={handleCreateAccount}
            onDelete={handleDeleteAccount}
            onOpen={setOpenAccountId}
          />
        )}
      </main>
    </div>
  );
}

export default App;
