import { useState, FormEvent } from 'react';
import type { AccountKind, AccountPayload } from '../types';

interface AccountFormProps {
  onSubmit: (payload: AccountPayload) => Promise<void>;
}

const EMPTY: AccountPayload = {
  name: '',
  bank: '',
  kind: 'credit_card',
  annual_rate: '',
  credit_limit: '',
  opening_balance: '',
  allows_directed_payments: false
};

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function AccountForm({ onSubmit }: AccountFormProps): JSX.Element {
  const [form, setForm] = useState<AccountPayload>(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof AccountPayload>(key: K, value: AccountPayload[K]): void =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
      setForm(EMPTY);
    } catch {
      // The parent shows the error; keep what was typed.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md space-y-4">
      <h2 className="text-xl font-bold">Nueva tarjeta o deuda</h2>

      <div>
        <label className={labelClass} htmlFor="acc-name">Nombre</label>
        <input id="acc-name" className={inputClass} value={form.name} required
          onChange={e => set('name', e.target.value)} placeholder="Ej: BBVA Oro" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="acc-bank">Banco</label>
          <input id="acc-bank" className={inputClass} value={form.bank}
            onChange={e => set('bank', e.target.value)} placeholder="Ej: BBVA" />
        </div>
        <div>
          <label className={labelClass} htmlFor="acc-kind">Tipo</label>
          <select id="acc-kind" className={inputClass} value={form.kind}
            onChange={e => set('kind', e.target.value as AccountKind)}>
            <option value="credit_card">Tarjeta de crédito</option>
            <option value="loan">Préstamo bancario</option>
            <option value="personal">Deuda con una persona</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="acc-rate">Tasa E.A. (%)</label>
          <input id="acc-rate" className={inputClass} type="number" min="0" step="any"
            value={form.annual_rate} onChange={e => set('annual_rate', e.target.value)} placeholder="Ej: 28.5" />
        </div>
        <div>
          <label className={labelClass} htmlFor="acc-limit">Cupo (COP)</label>
          <input id="acc-limit" className={inputClass} type="number" min="0" step="any"
            value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)} placeholder="0" />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="acc-opening">Saldo actual que debes (COP)</label>
        <input id="acc-opening" className={inputClass} type="number" min="0" step="any"
          value={form.opening_balance} onChange={e => set('opening_balance', e.target.value)} placeholder="0" />
        <p className="text-xs text-gray-500 mt-1">
          Lo que debes hoy. Desde aquí se suman tus compras y se restan tus abonos.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.allows_directed_payments}
          onChange={e => set('allows_directed_payments', e.target.checked)} />
        El banco permite abonar a una compra específica
      </label>

      <button type="submit" disabled={saving}
        className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-medium disabled:opacity-60">
        {saving ? 'Guardando…' : 'Agregar'}
      </button>
    </form>
  );
}
