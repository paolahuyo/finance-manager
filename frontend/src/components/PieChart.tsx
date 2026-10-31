import { formatCOP } from '../utils/format';

interface PieItem {
  label: string;
  value: number;
}

interface PieChartProps {
  title: string;
  subtitle?: string;
  items: PieItem[];
  /** Slices beyond this many are grouped as "Otros". */
  maxSlices?: number;
}

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#9ca3af'];
const OTHERS_COLOR = '#9ca3af';

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Donut chart drawn with SVG circles (no chart library). */
export default function PieChart({ title, subtitle, items, maxSlices = 7 }: PieChartProps): JSX.Element {
  const positive = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, i) => sum + i.value, 0);

  const top = positive.slice(0, maxSlices);
  const rest = positive.slice(maxSlices).reduce((sum, i) => sum + i.value, 0);
  const slices = rest > 0 ? [...top, { label: 'Otros', value: rest }] : top;

  let offset = 0;
  const arcs = slices.map((slice, index) => {
    const length = total > 0 ? (slice.value / total) * CIRCUMFERENCE : 0;
    const color = slice.label === 'Otros' ? OTHERS_COLOR : COLORS[index % COLORS.length];
    const arc = { ...slice, color, length, offset, percent: total > 0 ? (slice.value / total) * 100 : 0 };
    offset += length;
    return arc;
  });

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold">{title}</h2>
      {subtitle && <p className="text-sm text-gray-600 mb-4">{subtitle}</p>}
      {total === 0 ? (
        <p className="text-gray-500 text-sm mt-4">Sin datos este mes.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6 mt-4">
          <svg viewBox="0 0 200 200" className="w-48 h-48 shrink-0" role="img" aria-label={title}>
            <g transform="rotate(-90 100 100)">
              {arcs.map(arc => (
                <circle
                  key={arc.label}
                  cx="100"
                  cy="100"
                  r={RADIUS}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth="34"
                  strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                  strokeDashoffset={-arc.offset}
                />
              ))}
            </g>
            <text x="100" y="96" textAnchor="middle" className="fill-gray-500" fontSize="11">
              Total
            </text>
            <text x="100" y="114" textAnchor="middle" className="fill-gray-900" fontSize="13" fontWeight="bold">
              {formatCOP(total)}
            </text>
          </svg>
          <ul className="flex-1 min-w-48 space-y-2 text-sm">
            {arcs.map(arc => (
              <li key={arc.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-gray-700">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: arc.color }} />
                  {arc.label}
                </span>
                <span className="text-gray-900 font-medium whitespace-nowrap">
                  {formatCOP(arc.value)} <span className="text-gray-400">({arc.percent.toFixed(0)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
