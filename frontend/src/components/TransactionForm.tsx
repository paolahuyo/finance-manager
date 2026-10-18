import { useEffect, useState, FormEvent } from 'react';
import type { Account, Category, Currency, Transaction, TransactionPayload, TransactionType } from '../types';
import { api } from '../api';
import { formatCOP, formatLongDay, todayISO } from '../utils/format';

interface TransactionFormProps {
  categories: Category[];
  accounts: Account[];
  onSubmit: (payload: TransactionPayload) => Promise<void>;
  /** Movement being edited; the parent remounts the form (key) when it changes. */
  initial?: Transaction | null;
  onCancel?: () => void;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: TransactionType; label: string; active: string }> = [
  { value: 'expense', label: 'Gasto', active: 'bg-red-600 text-white border-red-600' },
  { value: 'income', label: 'Ingreso', active: 'bg-green-600 text-white border-green-600' },
  { value: 'payment', label: 'Abono', active: 'bg-blue-600 text-white border-blue-600' }
];

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function TransactionForm({
  categories,
  accounts,
  onSubmit,
  initial,
  onCancel
}: TransactionFormProps): JSX.Element {
  const editing = !!initial;
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.original_amount) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.original_currency ?? 'COP');
  const [rate, setRate] = useState(initial?.original_currency === 'USD' ? String(initial.exchange_rate) : '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ? String(initial.category_id) : '');
  const [accountId, setAccountId] = useState(initial?.account_id ? String(initial.account_id) : '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [saving, setSaving] = useState(false);

  // The rate follows the transaction date until the user picks a different "rate date".
  const [rateDate, setRateDate] = useState(initial?.date ?? todayISO());
  const [rateDateTouched, setRateDateTouched] = useState(false);
  const [rateManual, setRateManual] = useState(initial?.original_currency === 'USD');
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
  const isPayment = type === 'payment';
  const amountNumber = Number(amount);
  const rateNumber = Number(rate);
  const preview =
    currency === 'USD' && amountNumber > 0 && rateNumber > 0
      ? formatCOP(amountNumber * rateNumber)
      : null;

  const changeType = (next: TransactionType): void => {
    setType(next);
    setCategoryId('');
    if (next === 'income') setAccountId('');
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
        category_id: !isPayment && categoryId ? Number(categoryId) : null,
        account_id: accountId ? Number(accountId) : null,
        date
      });
      if (!editing) {
        setDescription('');
        setAmount('');
        setRateManual(false);
      }
    } catch {
      // The parent shows the error; keep the form filled so nothing is lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md space-y-4">
      <h2 className="text-xl font-bold">{editing ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tipo de movimiento">
        {TYPE_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => changeType(option.value)}
            aria-pressed={type === option.value}
            className={`py-2 rounded-md border font-medium ${
              type === option.value
                ? option.active
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {option.label}
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

      {type !== 'income' && (
        <div>
          <label className={labelClass} htmlFor="tx-account">
            {isPayment ? 'Abono a' : 'Pagado con (opcional)'}
          </label>
          <select
            id="tx-account"
            className={inputClass}
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            required={isPayment}
          >
            <option value="">{isPayment ? 'Elige la tarjeta o deuda' : 'Efectivo / débito'}</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {isPayment && accounts.length === 0 && (
            <p className="text-xs text-red-600 mt-1">Primero crea una tarjeta en la pestaña Tarjetas.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {!isPayment && (
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
        )}
        <div className={isPayment ? 'sm:col-span-2' : ''}>
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
        {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar'}
      </button>
      {editing && onCancel && (
        <button type="button" onClick={onCancel} className="w-full text-sm text-gray-600 hover:underline">
          Cancelar
        </button>
      )}
    </form>
  );
}
