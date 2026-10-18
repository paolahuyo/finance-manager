import type { Account, AccountPayload } from '../types';
import { formatCOP, monthLabel } from '../utils/format';
import AccountForm from '../components/AccountForm';
import SummaryCard from '../components/SummaryCard';

interface AccountsPageProps {
  month: string;
  accounts: Account[];
  onCreate: (payload: AccountPayload) => Promise<void>;
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
}

const KIND_LABEL = { credit_card: 'Tarjeta', loan: 'Préstamo', personal: 'Persona' } as const;
const th = 'px-4 py-3 text-left text-sm font-medium text-gray-700 whitespace-nowrap';
const td = 'px-4 py-3 text-sm text-gray-900 whitespace-nowrap';

export default function AccountsPage({ month, accounts, onCreate, onDelete, onOpen }: AccountsPageProps): JSX.Element {
  const sum = (pick: (a: Account) => number): number => accounts.reduce((total, a) => total + pick(a), 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard title="Deuda total" value={formatCOP(sum(a => a.balance))} icon="💳" color="red" />
        <SummaryCard title={`Intereses · ${monthLabel(month)}`} value={formatCOP(sum(a => a.month_interest))} icon="🏦" color="red" />
        <SummaryCard title={`Manejo, seguros y comisiones · ${monthLabel(month)}`} value={formatCOP(sum(a => a.month_fees))} icon="🧾" color="red" />
        <SummaryCard title={`Abonos · ${monthLabel(month)}`} value={formatCOP(sum(a => a.month_payments))} icon="✅" color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-2">
          <AccountForm onSubmit={onCreate} />
        </div>
        <div className="lg:col-span-3">
          {accounts.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow-md text-center text-gray-500">
              Aún no tienes tarjetas ni deudas registradas.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6 border-b">
                <h2 className="text-xl font-bold">Tarjetas y deudas</h2>
                <p className="text-sm text-gray-600">Haz clic en una tarjeta para ver sus compras a cuotas, abonos y movimientos.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className={th}>Nombre</th>
                      <th className={th}>Saldo</th>
                      <th className={th}>Tasa E.A.</th>
                      <th className={th}>Interés mes</th>
                      <th className={th}>Interés año</th>
                      <th className={th}>Cargos mes</th>
                      <th className={th}>Abonos mes</th>
                      <th className={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map(a => {
                      const used = a.credit_limit ? Math.round((a.balance / a.credit_limit) * 100) : null;
                      return (
                        <tr key={a.id} className="border-b hover:bg-gray-50">
                          <td className={td}>
                            <button onClick={() => onOpen(a.id)} className="font-medium text-blue-700 hover:underline text-left">
                              {a.name} →
                            </button>
                            <p className="text-xs text-gray-500">
                              {KIND_LABEL[a.kind]}{a.bank ? ` · ${a.bank}` : ''}
                              {used !== null && ` · cupo usado ${used}%`}
                            </p>
                          </td>
                          <td className={td}>{formatCOP(a.balance)}</td>
                          <td className={td}>{a.annual_rate !== null ? `${a.annual_rate}%` : '—'}</td>
                          <td className={`${td} text-red-600`}>{formatCOP(a.month_interest)}</td>
                          <td className={`${td} text-red-600`}>{formatCOP(a.year_interest)}</td>
                          <td className={`${td} text-red-600`} title="Cuota de manejo, seguros y comisiones">{formatCOP(a.month_fees)}</td>
                          <td className={`${td} text-green-600`}>{formatCOP(a.month_payments)}</td>
                          <td className={td}>
                            <button onClick={() => onDelete(a.id)} className="text-gray-400 hover:text-red-600"
                              aria-label={`Eliminar ${a.name}`}>
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
