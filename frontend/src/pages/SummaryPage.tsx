import type { MonthSummary } from '../types';
import { formatCOP } from '../utils/format';
import CategoryBreakdown from '../components/CategoryBreakdown';
import SummaryCard from '../components/SummaryCard';

interface SummaryPageProps {
  summary: MonthSummary | null;
  loading: boolean;
}

export default function SummaryPage({ summary, loading }: SummaryPageProps): JSX.Element {
  if (!summary) {
    return <div className="text-center py-8 text-gray-500">{loading ? 'Cargando…' : 'Sin datos.'}</div>;
  }

  return (
    <div className="space-y-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CategoryBreakdown title="Gastos por categoría" items={summary.expenseByCategory} barClass="bg-red-500" />
        <CategoryBreakdown title="Ingresos por categoría" items={summary.incomeByCategory} barClass="bg-green-500" />
      </div>
    </div>
  );
}
