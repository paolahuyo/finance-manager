import { useMemo, useState, ChangeEvent } from 'react';
import { api, errorMessage } from '../api';
import type { Account, Category, ImportItem, ImportKind, ImportPreview } from '../types';
import { formatCOP, formatLongDay } from '../utils/format';

interface ImportPageProps {
  accounts: Account[];
  categories: Category[];
  onImported: () => Promise<void>;
}

const KIND_LABEL: Record<ImportKind, { text: string; className: string }> = {
  purchase: { text: 'Compra', className: 'bg-red-100 text-red-700' },
  interest: { text: 'Interés', className: 'bg-orange-100 text-orange-700' },
  fee: { text: 'Comisión', className: 'bg-orange-100 text-orange-700' },
  payment: { text: 'Abono', className: 'bg-blue-100 text-blue-700' },
  credit: { text: 'Devolución', className: 'bg-purple-100 text-purple-700' }
};

const inputClass = 'px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function ImportPage({ accounts, categories, onImported }: ImportPageProps): JSX.Element {
  const [accountId, setAccountId] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const selected = useMemo(() => items.filter(i => i.selected), [items]);
  const selectedTotal = selected.reduce((sum, i) => sum + i.amount_cop, 0);

  const patchItem = (hash: string, patch: Partial<ImportItem>): void =>
    setItems(prev => prev.map(i => (i.import_hash === hash ? { ...i, ...patch } : i)));

  const handleFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !accountId) return;
    setBusy(true);
    setError('');
    setResult('');
    setPreview(null);
    try {
      const data = await api.previewImport(Number(accountId), file);
      setPreview(data);
      setItems(data.items);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo leer el extracto'));
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const res = await api.commitImport(Number(accountId), selected);
      setResult(
        `Se importaron ${res.inserted} movimientos` +
          (res.skipped_duplicates ? ` (${res.skipped_duplicates} ya existían y se omitieron)` : '') +
          '.'
      );
      setPreview(null);
      setItems([]);
      await onImported();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la importación'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
        <h2 className="text-xl font-bold">Importar extracto o movimientos</h2>
        <p className="text-sm text-gray-600">
          Sube el PDF digital del extracto de tu tarjeta, o el Excel de movimientos de BBVA. Primero verás una lista para revisar; nada se guarda hasta
          que confirmes. El archivo se analiza en tu computador y no se almacena.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Tarjeta del extracto"
            className={inputClass}
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
          >
            <option value="">1. Elige la tarjeta</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <label
            className={`px-4 py-2 rounded-md font-medium ${
              accountId && !busy
                ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {busy ? 'Leyendo…' : '2. Subir PDF o Excel'}
            <input type="file" accept="application/pdf,.pdf,.xlsx" className="sr-only" disabled={!accountId || busy} onChange={handleFile} />
          </label>
        </div>
        {accounts.length === 0 && (
          <p className="text-sm text-red-600">Primero crea la tarjeta en la pestaña Tarjetas.</p>
        )}
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}
      {result && <div role="status" className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">{result}</div>}

      {preview && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 border-b space-y-2">
            <h3 className="text-lg font-bold">
              {preview.format === 'excel' ? 'Movimientos' : 'Extracto'} {preview.bank}
              {preview.period_start && preview.period_end
                ? ` · ${formatLongDay(preview.period_start)} – ${formatLongDay(preview.period_end)}`
                : preview.period_end
                  ? ` · corte ${formatLongDay(preview.period_end)}`
                  : ''}
            </h3>
            {preview.skipped_installments > 0 && (
              <p className="text-sm text-gray-600">
                Se omitieron {preview.skipped_installments} cuotas de compras de meses anteriores: ya fueron un gasto
                cuando ocurrieron.
              </p>
            )}
            {preview.warnings.map(w => (
              <p key={w} className="text-sm text-amber-700">⚠ {w}</p>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3"><span className="sr-only">Importar</span></th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">Fecha</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">Descripción</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">Tipo</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700">Valor (COP)</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700">Categoría</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const kind = KIND_LABEL[item.kind];
                  const hasCategory = item.kind === 'purchase';
                  return (
                    <tr key={item.import_hash} className={`border-b ${item.duplicate ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Importar ${item.description}`}
                          checked={item.selected}
                          disabled={item.duplicate}
                          onChange={e => patchItem(item.import_hash, { selected: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatLongDay(item.date)}</td>
                      <td className="px-3 py-2">
                        <p>{item.description}</p>
                        {item.original_currency === 'USD' && item.original_amount !== undefined && (
                          <p className="text-xs text-gray-500">USD {item.original_amount.toFixed(2)}</p>
                        )}
                        {item.note && <p className={`text-xs ${item.duplicate ? '' : 'text-amber-700'}`}>{item.note}</p>}
                        {item.duplicate && !item.note && <p className="text-xs">Ya importado antes</p>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${kind.className}`}>{kind.text}</span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatCOP(item.amount_cop)}</td>
                      <td className="px-3 py-2">
                        {hasCategory ? (
                          <select
                            aria-label={`Categoría de ${item.description}`}
                            className={`${inputClass} py-1`}
                            value={item.category_id ?? ''}
                            disabled={item.duplicate}
                            onChange={e => patchItem(item.import_hash, { category_id: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">Sin categoría</option>
                            {expenseCategories.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-6 flex flex-wrap items-center justify-between gap-3 bg-gray-50">
            <p className="text-sm text-gray-700">
              {selected.length} de {items.length} seleccionados · {formatCOP(selectedTotal)}
            </p>
            <button
              onClick={handleCommit}
              disabled={busy || selected.length === 0}
              className="bg-blue-600 text-white px-5 py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Guardando…' : `Importar ${selected.length} movimientos`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
