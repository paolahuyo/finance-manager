import type { MonthHistoryPoint, MonthTag } from '../types';
import { formatCOP, monthLabel } from '../utils/format';

interface SpendingByMonthProps {
  history: MonthHistoryPoint[];
  tags: MonthTag[];
  selectedMonth: string;
}

const NORMAL = '#3b82f6';
const TRAVEL = '#f59e0b';

const shortMonth = (month: string): string => {
  const [year, mon] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(new Date(year, mon - 1, 1)).replace('.', '');
};

const compact = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} mil`;
  return String(Math.round(value));
};

const average = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/** Bars of the monthly expense. Trip months get their own colour and stay out of the "normal month" average. */
export default function SpendingByMonth({ history, tags, selectedMonth }: SpendingByMonthProps): JSX.Element {
  const travel = new Set(tags.filter(t => t.tag === 'viaje').map(t => t.month));
  const withData = history.filter(p => p.expense > 0);
  const normalAverage = average(withData.filter(p => !travel.has(p.month)).map(p => p.expense));
  const travelAverage = average(withData.filter(p => travel.has(p.month)).map(p => p.expense));
  const max = Math.max(1, ...history.map(p => p.expense));

  const width = 600;
  const height = 220;
  const top = 28;
  const bottom = 30;
  const slot = width / Math.max(history.length, 1);
  const barWidth = Math.min(56, slot * 0.6);
  const chartHeight = height - top - bottom;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold">Gastos por mes</h2>
      <p className="text-sm text-gray-600 mb-4">
        Los meses de viaje (✈️, en naranja) no cuentan para el promedio de un mes normal.
      </p>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gastos por mes">
        <line x1="0" y1={height - bottom} x2={width} y2={height - bottom} stroke="#e5e7eb" />
        {history.map((point, index) => {
          const isTravel = travel.has(point.month);
          const barHeight = (point.expense / max) * chartHeight;
          const x = index * slot + (slot - barWidth) / 2;
          const y = height - bottom - barHeight;
          const selected = point.month === selectedMonth;
          return (
            <g key={point.month}>
              <rect
                x={x}
                y={point.expense > 0 ? y : height - bottom - 2}
                width={barWidth}
                height={point.expense > 0 ? barHeight : 2}
                rx="3"
                fill={point.expense > 0 ? (isTravel ? TRAVEL : NORMAL) : '#d1d5db'}
                stroke={selected ? '#111827' : 'none'}
                strokeWidth="2"
              >
                <title>{`${monthLabel(point.month)}: ${formatCOP(point.expense)}${isTravel ? ' (viaje)' : ''}`}</title>
              </rect>
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="11" className="fill-gray-700">
                {point.expense > 0 ? compact(point.expense) : 'sin datos'}
              </text>
              <text x={x + barWidth / 2} y={height - 10} textAnchor="middle" fontSize="12" className="fill-gray-600">
                {isTravel ? '✈️ ' : ''}
                {shortMonth(point.month)}
              </text>
            </g>
          );
        })}
      </svg>

      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
          <dt className="text-gray-600">Mes normal (promedio)</dt>
          <dd className="text-lg font-bold text-blue-700">{normalAverage > 0 ? formatCOP(normalAverage) : '—'}</dd>
        </div>
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
          <dt className="text-gray-600">Mes de viaje (promedio)</dt>
          <dd className="text-lg font-bold text-amber-700">{travelAverage > 0 ? formatCOP(travelAverage) : '—'}</dd>
        </div>
      </dl>
      <p className="text-xs text-gray-500 mt-3">
        Los meses sin extracto cargado salen como «sin datos»: el gráfico solo ve lo que ya está en la app.
      </p>
    </div>
  );
}
