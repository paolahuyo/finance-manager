import { currentMonth, monthLabel, shiftMonth } from '../utils/format';

interface MonthNavigatorProps {
  month: string;
  onChange: (month: string) => void;
}

export default function MonthNavigator({ month, onChange }: MonthNavigatorProps): JSX.Element {
  const isCurrent = month === currentMonth();
  const buttonClass =
    'px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-sm';

  return (
    <div className="flex items-center gap-2">
      <button className={buttonClass} aria-label="Mes anterior" onClick={() => onChange(shiftMonth(month, -1))}>
        ←
      </button>
      <span className="min-w-40 text-center font-semibold text-gray-800">{monthLabel(month)}</span>
      <button className={buttonClass} aria-label="Mes siguiente" onClick={() => onChange(shiftMonth(month, 1))}>
        →
      </button>
      {!isCurrent && (
        <button className={`${buttonClass} text-blue-700`} onClick={() => onChange(currentMonth())}>
          Hoy
        </button>
      )}
    </div>
  );
}
