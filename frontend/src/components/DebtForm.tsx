import { useState, FormEvent, ChangeEvent } from 'react';

export interface DebtFormData {
  name: string;
  amount: string;
  interest_rate: string;
  min_payment: string;
}

interface DebtFormProps {
  onSubmit: (data: DebtFormData) => void;
}

const EMPTY: DebtFormData = { name: '', amount: '', interest_rate: '', min_payment: '' };
const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function DebtForm({ onSubmit }: DebtFormProps): JSX.Element {
  const [formData, setFormData] = useState<DebtFormData>(EMPTY);

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.currentTarget;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    onSubmit(formData);
    setFormData(EMPTY);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md space-y-4">
      <h2 className="text-xl font-bold">Nueva deuda</h2>

      <div>
        <label className={labelClass} htmlFor="debt-name">Nombre</label>
        <input id="debt-name" className={inputClass} type="text" name="name" value={formData.name}
          onChange={handleChange} required placeholder="Ej: Tarjeta de crédito, Crédito educativo" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="debt-amount">Saldo (COP)</label>
          <input id="debt-amount" className={inputClass} type="number" min="0" step="any" name="amount"
            value={formData.amount} onChange={handleChange} required placeholder="0" />
        </div>
        <div>
          <label className={labelClass} htmlFor="debt-rate">Tasa de interés (%)</label>
          <input id="debt-rate" className={inputClass} type="number" min="0" step="any" name="interest_rate"
            value={formData.interest_rate} onChange={handleChange} placeholder="0" />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="debt-min">Pago mínimo (COP)</label>
        <input id="debt-min" className={inputClass} type="number" min="0" step="any" name="min_payment"
          value={formData.min_payment} onChange={handleChange} placeholder="0" />
      </div>

      <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-medium">
        Agregar deuda
      </button>
    </form>
  );
}
