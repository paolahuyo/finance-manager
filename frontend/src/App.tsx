import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from './api';
import type { Account, AccountPayload, Category, MonthHistoryPoint, MonthSummary, MonthTag, Transaction, TransactionPayload } from './types';
import { currentMonth, todayISO } from './utils/format';
import Header from './components/Header';
import MonthNavigator from './components/MonthNavigator';
import UpcomingPayments from './components/UpcomingPayments';
import FeesBreakdown from './components/FeesBreakdown';
import InterestBreakdown from './components/InterestBreakdown';
import MonthPlan from './components/MonthPlan';
import AccountsPage from './pages/AccountsPage';
import AccountDetailPage from './pages/AccountDetailPage';
import PaymentPlanPage from './pages/PaymentPlanPage';
import ImportPage from './pages/ImportPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import SummaryPage from './pages/SummaryPage';
import TransactionsPage from './pages/TransactionsPage';

type Tab = 'summary' | 'transactions' | 'plan' | 'accounts' | 'subscriptions' | 'import';

const TABS: ReadonlyArray<Tab> = ['summary', 'transactions', 'plan', 'accounts', 'subscriptions', 'import'];

function App(): JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('summary');
  const [month, setMonth] = useState<string>(currentMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<MonthHistoryPoint[]>([]);
  const [tags, setTags] = useState<MonthTag[]>([]);
  const [openAccountId, setOpenAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    api.categories().then(setCategories).catch(() => setError('No se pudieron cargar las categorías'));
  }, []);

  const loadMonth = useCallback(async (target: string): Promise<{
    txs: Transaction[]; sum: MonthSummary; accs: Account[]; hist: MonthHistoryPoint[]; tg: MonthTag[];
  }> => {
    // Fixed monthly items and payroll loan installments become movements once their day arrives.
    await api.applyRecurring(target, todayISO()).catch(() => undefined);
    const [txs, sum, accs, hist, tg] = await Promise.all([
      api.transactions(target),
      api.summary(target),
      api.accounts(target),
      api.summaryHistory(6),
      api.monthTags()
    ]);
    return { txs, sum, accs, hist, tg };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadMonth(month)
      .then(({ txs, sum, accs, hist, tg }) => {
        if (cancelled) return;
        setTransactions(txs);
        setSummary(sum);
        setAccounts(accs);
        setHistory(hist);
        setTags(tg);
        setError('');
      })
      .catch(() => !cancelled && setError('No se pudieron cargar los datos del mes'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month, loadMonth]);

  const refresh = async (): Promise<void> => {
    const { txs, sum, accs, hist, tg } = await loadMonth(month);
    setTransactions(txs);
    setSummary(sum);
    setAccounts(accs);
    setHistory(hist);
    setTags(tg);
  };

  const handleToggleTravel = async (): Promise<void> => {
    const tagged = tags.some(t => t.month === month && t.tag === 'viaje');
    try {
      if (tagged) await api.removeMonthTag(month);
      else await api.setMonthTag(month);
      setTags(await api.monthTags());
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la marca del mes'));
    }
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

  const handleUpdate = async (id: number, payload: TransactionPayload): Promise<void> => {
    try {
      await api.updateTransaction(id, payload);
      setError('');
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
          <nav className="flex gap-1 bg-gray-200 p-1 rounded-lg" aria-label={t('app.sections')}>
            {TABS.map(id => (
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
                {t(`tabs.${id}`)}
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
        {tab === 'summary' && <MonthPlan categories={categories} refreshKey={accounts} onChanged={() => void refresh()} />}
        {tab === 'summary' && (
          <SummaryPage
            summary={summary}
            loading={loading}
            month={month}
            history={history}
            tags={tags}
            onToggleTravel={() => void handleToggleTravel()}
          />
        )}
        {tab === 'transactions' && (
          <TransactionsPage
            categories={categories}
            accounts={accounts}
            transactions={transactions}
            loading={loading}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        )}
        {tab === 'plan' && <PaymentPlanPage onChanged={refresh} />}
        {tab === 'subscriptions' && <SubscriptionsPage refreshKey={transactions} />}
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
        {tab === 'accounts' && openAccountId === null && (
          <FeesBreakdown month={month} refreshKey={accounts} onOpen={setOpenAccountId} />
        )}
        {tab === 'accounts' && openAccountId === null && (
          <InterestBreakdown refreshKey={accounts} onOpen={setOpenAccountId} />
        )}
      </main>
    </div>
  );
}

export default App;
