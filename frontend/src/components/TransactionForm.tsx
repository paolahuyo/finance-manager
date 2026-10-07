import { useEffect, useState, FormEvent } from 'react';
import type { Category, Currency, TransactionPayload, TransactionType } from '../types';
import { formatCOP, todayISO } from '../utils/format';

interface TransactionFormProps {
  categories: Category[];
  usdRate: number | null;
  onSubmit: (payload: TransactionPayload) => Promise<void>;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function TransactionForm({
  categories,
  usdRate,
  onSubmit
}: TransactionFormProps): JSX.Element {
  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('COP');
  const [rate, setRate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  // Prefill the suggested USD→COP rate once it is known, without overwriting what the user typed.
  useEffect(() => {
    if (usdRate && rate === '') setRate(String(usdRate));
  }, [usdRate, rate]);

  const typeCategories = categories.filter(c => c.type === type);
  const amountNumber = Number(amount);
  const rateNumber = Number(rate);
  const preview =
    currency === 'USD' && amountNumber > 0 && rateNumber > 0
      ? formatCOP(amountNumber * rateNumber)
      : null;

  const changeType = (next: TransactionType): void => {
    setType(next);
    setCategoryId('');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        type,
        description,
        amount: amountNumber,
        currency,
        exchange_rate: currency === 'USD' && rateNumber > 0 ? rateNumber : undefined,
        category_id: categoryId ? Number(categoryId) : null,
        date
      });
      setDescription('');
      setAmount('');
    } catch {
      // The parent shows the error; keep the form filled so nothing is lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md space-y-4">
      <h2 className="text-xl font-bold">Nuevo movimiento</h2>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de movimiento">
        {(['expense', 'income'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => changeType(option)}
            aria-pressed={type === option}
            className={`py-2 rounded-md border font-medium ${
              type === option
                ? option === 'expense'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {option === 'expense' ? 'Gasto' : 'Ingreso'}
          </button>
        ))}
      </div>

      <div>
        <label className={labelClass} htmlFor="tx-description">Descripción</label>
        <input
          id="tx-description"
          className={inputClass}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Ej: Mercado, Salario"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={labelClass} htmlFor="tx-amount">Monto</label>
          <input
            id="tx-amount"
            className={inputClass}
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="tx-currency">Moneda</label>
          <select
            id="tx-currency"
            className={inputClass}
            value={currency}
            onChange={e => setCurrency(e.target.value as Currency)}
          >
            <option value="COP">COP</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      {currency === 'USD' && (
        <div>
          <label className={labelClass} htmlFor="tx-rate">Tasa USD → COP</label>
          <input
            id="tx-rate"
            className={inputClass}
            type="number"
            min="0"
            step="any"
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder={usdRate ? String(usdRate) : 'Ingrésala manualmente'}
            required={!usdRate}
          />
          <p className="text-xs text-gray-500 mt-1">
            {preview ? `Equivale a ${preview}` : 'Se convertirá a pesos con esta tasa.'}
            {usdRate ? '' : ' (No se pudo obtener la tasa del día.)'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="tx-category">Categoría</label>
          <select
            id="tx-category"
            className={inputClass}
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
          >
            <option value="">Sin categoría</option>
            {typeCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="tx-date">Fecha</label>
          <input
            id="tx-date"
            className={inputClass}
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-medium disabled:opacity-60"
      >
        {saving ? 'Guardando…' : 'Agregar'}
      </button>
    </form>
  );
}
