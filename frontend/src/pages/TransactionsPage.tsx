import { useState } from 'react';
import type { Account, Category, Transaction, TransactionPayload } from '../types';
import TransactionForm from '../components/TransactionForm';
import TransactionList from '../components/TransactionList';

interface TransactionsPageProps {
  categories: Category[];
  accounts: Account[];
  transactions: Transaction[];
  loading: boolean;
  onCreate: (payload: TransactionPayload) => Promise<void>;
  onUpdate: (id: number, payload: TransactionPayload) => Promise<void>;
  onDelete: (id: number) => void;
}

export default function TransactionsPage({
  categories,
  accounts,
  transactions,
  loading,
  onCreate,
  onUpdate,
  onDelete
}: TransactionsPageProps): JSX.Element {
  const [editing, setEditing] = useState<Transaction | null>(null);

  const submit = async (payload: TransactionPayload): Promise<void> => {
    if (editing) {
      await onUpdate(editing.id, payload);
      setEditing(null);
    } else {
      await onCreate(payload);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      <div className="lg:col-span-2">
        <TransactionForm
          key={editing?.id ?? 'new'}
          categories={categories}
          accounts={accounts}
          onSubmit={submit}
          initial={editing}
          onCancel={() => setEditing(null)}
        />
      </div>
      <div className="lg:col-span-3">
        {loading && transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Cargando…</div>
        ) : (
          <TransactionList transactions={transactions} onDelete={onDelete} onEdit={tx => { setEditing(tx); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        )}
      </div>
    </div>
  );
}
