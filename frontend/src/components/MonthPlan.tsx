import { useEffect, useState, FormEvent } from 'react';
import { api, errorMessage } from '../api';
import MoneyInput from './MoneyInput';
import type { Category, RecurringItem, UpcomingPayment } from '../types';
import { formatCOP, formatLongDay, todayISO } from '../utils/format';

interface MonthPlanProps {
  categories: Category[];
  refreshKey?: unknown;
  onChanged: () => void;
}

const pad = (n: number): string => String(n).padStart(2, '0');
function nextOccurrence(day: number, from: string): string {
  const [y, m, d] = from.split('-').map(Number);
  const make = (year: number, month: number): string => {
    const last = new Date(year, month, 0).getDate();
    return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
  };
  return d <= day ? make(y, m) : m === 12 ? make(y + 1, 1) : make(y, m + 1);
}
const addMonth = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-${pad(d)}` : `${y}-${pad(m + 1)}-${pad(d)}`;
};

export default function MonthPlan({ categories, refreshKey, onChanged }: MonthPlanProps): JSX.Element {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [due, setDue] = useState<UpcomingPayment[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ type: 'expense' as 'income' | 'expense', description: '', amount: '', day: '1', category: '' });

  const load = (): void => {
    api.recurring().then(setItems).catch(() => setItems([]));
    api.upcomingPayments().then(setDue).catch(() => setDue([]));
  };
  useEffect(load, [refreshKey]);

  const today = todayISO();
  const salary = items.find(i => i.type === 'income');
  const incomes = items.filter(i => i.type === 'income');
  const fixedExpenses = items.filter(i => i.type === 'expense');
  const payday = salary ? nextOccurrence(salary.day_of_month, today) : null;
  const followingPayday = payday ? addMonth(payday) : null;
  const pending = due
    .map(p => ({ ...p, left: Math.max((p.minimum_payment ?? 0) - p.paid_since_cutoff, 0) }))
    .filter(p => p.left > 0.01);
  const beforePayday = payday ? pending.filter(p => p.due_date < payday) : [];
  const withSalary = payday && followingPayday ? pending.filter(p => p.due_date >= payday && p.due_date < followingPayday) : pending;
  const incomeTotal = incomes.reduce((t, i) => t + i.amount_cop, 0);
  const fixedTotal = fixedExpenses.reduce((t, i) => t + i.amount_cop, 0);
  const minimumsTotal = withSalary.reduce((t, p) => t + p.left, 0);
  const free = incomeTotal - fixedTotal - minimumsTotal;

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      const payload = {
        type: form.type,
        description: form.description,
        amount: Number(form.amount),
        category_id: form.category ? Number(form.category) : null,
        day_of_month: Number(form.day)
      };
      if (editingId !== null) await api.updateRecurring(editingId, payload);
      else await api.createRecurring(payload);
      setForm({ type: 'expense', description: '', amount: '', day: '1', category: '' });
      setAdding(false);
      setEditingId(null);
      setError('');
      load();
      onChanged();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'));
    }
  };
  const edit = (i: RecurringItem): void => {
    setForm({
      type: i.type, description: i.description, amount: String(i.amount_cop),
      day: String(i.day_of_month), category: i.category_id ? String(i.category_id) : ''
    });
    setEditingId(i.id);
    setAdding(true);
    setError('');
  };
  const cancel = (): void => {
    setAdding(false);
    setEditingId(null);
    setForm({ type: 'expense', description: '', amount: '', day: '1', category: '' });
  };
  const remove = async (id: number): Promise<void> => {
    if (!window.confirm('¿Quitar este movimiento fijo? Los meses ya registrados se conservan.')) return;
    await api.deleteRecurring(id);
    load();
  };

  const input = 'px-3 py-2 border border-gray-300 rounded-md text-sm';
  const line = (label: string, value: number, sign: '+' | '−', strong = false): JSX.Element => (
    <div className={`flex justify-between py-1 ${strong ? 'font-bold text-lg border-t mt-1 pt-2' : 'text-sm'}`}>
      <span>{label}</span>
      <span className={sign === '+' ? 'text-green-700' : 'text-red-700'}>{sign} {formatCOP(Math.abs(value))}</span>
    </div>
  );

  return (
    <section className="bg-white rounded-lg shadow-md p-6 space-y-4" aria-labelledby="plan-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="plan-title" className="text-xl font-bold">🧮 Tu mes</h2>
        {payday && <p className="text-sm text-gray-600">Próximo sueldo: <strong>{formatLongDay(payday)}</strong></p>}
      </div>

      {beforePayday.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
          <p className="font-bold text-red-700">Antes del sueldo debes pagar:</p>
          {beforePayday.map(p => (
            <p key={p.id} className="text-sm text-red-800">
              {p.name}: <strong>{formatCOP(p.left)}</strong> hasta el {formatLongDay(p.due_date)}
            </p>
          ))}
        </div>
      )}

      {salary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            {incomes.map(i => <div key={i.id}>{line(`${i.description} (día ${i.day_of_month})`, i.amount_cop, '+')}</div>)}
            {fixedExpenses.map(i => <div key={i.id}>{line(`${i.description} (día ${i.day_of_month})`, i.amount_cop, '−')}</div>)}
            {withSalary.map(p => <div key={p.id}>{line(`Mínimo ${p.name} (vence ${formatLongDay(p.due_date)})`, p.left, '−')}</div>)}
            {line('Te queda para gastos y abonos', free, free >= 0 ? '+' : '−', true)}
            <p className="text-xs text-gray-500 mt-1">
              Las libranzas ya vienen descontadas en el sueldo neto. Estimado: ajusta los valores si cambian.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Movimientos fijos mensuales</p>
            <ul className="divide-y text-sm">
              {items.map(i => (
                <li key={i.id} className="flex justify-between gap-2 py-1">
                  <span>Día {i.day_of_month} · {i.description}</span>
                  <span className="flex gap-3">
                    <span className={i.type === 'income' ? 'text-green-700' : 'text-red-700'}>{formatCOP(i.amount_cop)}</span>
                    <button onClick={() => edit(i)} className="text-gray-400 hover:text-blue-600" aria-label={`Editar ${i.description}`}>✎</button>
                    <button onClick={() => remove(i.id)} className="text-gray-400 hover:text-red-600" aria-label={`Quitar ${i.description}`}>✕</button>
                  </span>
                </li>
              ))}
            </ul>
            {!adding && <button onClick={() => setAdding(true)} className="mt-2 text-sm text-blue-700 hover:underline">+ Agregar fijo mensual</button>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600">Agrega tu sueldo como movimiento fijo para ver cuánto te queda cada mes.</p>
      )}

      {(adding || !salary) && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t pt-4">
          <select className={input} disabled={editingId !== null} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'income' | 'expense', category: '' })} aria-label="Tipo">
            <option value="expense">Gasto fijo</option>
            <option value="income">Ingreso fijo</option>
          </select>
          <input className={input} placeholder="Descripción (ej. Internet)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required aria-label="Descripción" />
          <MoneyInput className={`${input} w-36`} placeholder="Monto" value={form.amount} onChange={v => setForm({ ...form, amount: v })} required aria-label="Monto" />
          <label className="text-sm">Día <input className={`${input} w-16`} type="number" min="1" max="31" value={form.day} onChange={e => setForm({ ...form, day: e.target.value })} required /></label>
          <select className={input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} aria-label="Categoría">
            <option value="">Sin categoría</option>
            {categories.filter(c => c.type === form.type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">{editingId !== null ? 'Guardar cambios' : 'Guardar'}</button>
          {adding && <button type="button" onClick={cancel} className="text-sm text-gray-500">Cancelar</button>}
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      )}
    </section>
  );
}
