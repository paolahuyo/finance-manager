import type { MonthHistoryPoint, MonthSummary, MonthTag } from '../types';
import { formatCOP, monthLabel } from '../utils/format';
import CategoryBreakdown from '../components/CategoryBreakdown';
import PieChart from '../components/PieChart';
import SpendingByMonth from '../components/SpendingByMonth';
import SummaryCard from '../components/SummaryCard';

interface SummaryPageProps {
  summary: MonthSummary | null;
  loading: boolean;
  month: string;
  history: MonthHistoryPoint[];
  tags: MonthTag[];
  onToggleTravel: () => void;
}

export default function SummaryPage({ summary, loading, month, history, tags, onToggleTravel }: SummaryPageProps): JSX.Element {
  if (!summary) {
    return <div className="text-center py-8 text-gray-500">{loading ? 'Cargando…' : 'Sin datos.'}</div>;
  }

  const isTravel = tags.some(t => t.month === month && t.tag === 'viaje');

  return (
    <div className="space-y-8">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
          isTravel ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'
        }`}
      >
        <p className="text-sm text-gray-800">
          {isTravel ? (
            <>
              ✈️ <strong>{monthLabel(month)} es un mes de viaje.</strong> Tiene más gastos de lo normal y no cuenta
              para el promedio de un mes normal.
            </>
          ) : (
            <>¿{monthLabel(month)} fue un mes de viaje u otro mes especial? Márcalo para no mezclarlo con tu gasto normal.</>
          )}
        </p>
        <button
          onClick={onToggleTravel}
          className="px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-sm whitespace-nowrap"
        >
          {isTravel ? 'Quitar marca de viaje' : '✈️ Marcar como mes de viaje'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="Ingresos" value={formatCOP(summary.income)} icon="📈" color="green" />
        <SummaryCard title="Gastos" value={formatCOP(summary.expense)} icon="📉" color="red" />
        <SummaryCard
          title="Balance del mes"
          value={formatCOP(summary.balance)}
          icon={summary.balance >= 0 ? '✅' : '⚠️'}
          color={summary.balance >= 0 ? 'blue' : 'red'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="Intereses del mes" value={formatCOP(summary.interest)} icon="🏦" color="red" />
        <SummaryCard title="Cuota de manejo, seguros y comisiones" value={formatCOP(summary.fees)} icon="🧾" color="red" />
        <SummaryCard title="Abonos a tarjetas y deudas" value={formatCOP(summary.payments)} icon="💳" color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <PieChart
          title="¿En qué se va la plata?"
          subtitle={`Gastos de ${monthLabel(month)} por categoría`}
          items={summary.expenseByCategory.map(c => ({ label: c.category_name, value: c.total }))}
        />
        <CategoryBreakdown title="Ingresos por categoría" items={summary.incomeByCategory} barClass="bg-green-500" />
      </div>

      <SpendingByMonth history={history} tags={tags} selectedMonth={month} />
    </div>
  );
}
