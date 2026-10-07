import type { Category, Transaction, TransactionPayload } from '../types';
import TransactionForm from '../components/TransactionForm';
import TransactionList from '../components/TransactionList';

interface TransactionsPageProps {
  categories: Category[];
  transactions: Transaction[];
  usdRate: number | null;
  loading: boolean;
  onCreate: (payload: TransactionPayload) => Promise<void>;
  onDelete: (id: number) => void;
}

export default function TransactionsPage({
  categories,
  transactions,
  usdRate,
  loading,
  onCreate,
  onDelete
}: TransactionsPageProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1">
        <TransactionForm categories={categories} usdRate={usdRate} onSubmit={onCreate} />
      </div>
      <div className="lg:col-span-2">
        {loading && transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Cargando…</div>
        ) : (
          <TransactionList transactions={transactions} onDelete={onDelete} />
        )}
      </div>
    </div>
  );
}
