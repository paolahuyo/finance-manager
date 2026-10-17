import { useEffect, useState, FormEvent } from 'react';
import type { Category, Currency, TransactionPayload, TransactionType } from '../types';
import { api } from '../api';
import { formatCOP, formatLongDay, todayISO } from '../utils/format';

interface TransactionFormProps {
  categories: Category[];
  onSubmit: (payload: TransactionPayload) => Promise<void>;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function TransactionForm({
  categories,
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

  // The rate follows the transaction date until the user picks a different "rate date".
  const [rateDate, setRateDate] = useState(todayISO());
  const [rateDateTouched, setRateDateTouched] = useState(false);
  const [rateManual, setRateManual] = useState(false);
  const [rateNote, setRateNote] = useState('');

  useEffect(() => {
    if (!rateDateTouched) setRateDate(date);
  }, [date, rateDateTouched]);

  // Look up the official TRM for the chosen day. A rate typed by hand is never overwritten.
  useEffect(() => {
    if (currency !== 'USD' || rateManual || !rateDate) return;
    let cancelled = false;
    setRateNote('Consultando TRM…');
    api.trmRate(rateDate).then(info => {
      if (cancelled) return;
      if (!info) {
        setRateNote('No se pudo obtener la TRM. Escríbela manualmente.');
        return;
      }
      setRate(String(info.usd_cop));
      setRateNote(
        info.exact
          ? `TRM del ${formatLongDay(rateDate)}`
          : `Aún no hay TRM publicada para esa fecha; se usa la más reciente (${formatLongDay(info.valid_from)})`
      );
    });
    return () => {
      cancelled = true;
    };
  }, [currency, rateDate, rateManual]);

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
      setRateManual(false);
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
        <div className="space-y-2 rounded-md bg-gray-50 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="tx-rate-date">Fecha de la tasa</label>
              <input
                id="tx-rate-date"
                className={inputClass}
                type="date"
                value={rateDate}
                onChange={e => {
                  setRateDate(e.target.value);
                  setRateDateTouched(true);
                  setRateManual(false);
                }}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="tx-rate">Tasa USD → COP</label>
              <input
                id="tx-rate"
                className={inputClass}
                type="number"
                min="0"
                step="any"
                value={rate}
                onChange={e => {
                  setRate(e.target.value);
                  setRateManual(true);
                  setRateNote('Tasa escrita manualmente');
                }}
                required
              />
            </div>
          </div>
          <p className="text-xs text-gray-600">
            {rateNote}
            {preview && <strong className="ml-1">· Equivale a {preview}</strong>}
            {rateManual && (
              <button
                type="button"
                className="ml-2 text-blue-700 underline"
                onClick={() => setRateManual(false)}
              >
                Usar la TRM de esa fecha
              </button>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
