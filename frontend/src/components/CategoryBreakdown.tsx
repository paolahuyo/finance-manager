import type { CategoryTotal } from '../types';
import { formatCOP } from '../utils/format';

interface CategoryBreakdownProps {
  title: string;
  items: CategoryTotal[];
  barClass: string;
}

export default function CategoryBreakdown({ title, items, barClass }: CategoryBreakdownProps): JSX.Element {
  const total = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      {items.length === 0 ? (
        <p className="text-gray-500 text-sm">Sin datos este mes.</p>
      ) : (
        <ul className="space-y-3">
          {items.map(item => {
            const percent = total > 0 ? (item.total / total) * 100 : 0;
            return (
              <li key={item.category_id ?? 'none'}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{item.category_name}</span>
                  <span className="text-gray-900 font-medium">
                    {formatCOP(item.total)} <span className="text-gray-400">({percent.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${barClass}`} style={{ width: `${percent}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
