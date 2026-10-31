import type { InputHTMLAttributes } from 'react';

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Plain number as a string with '.' as decimal separator (e.g. "1250000.5"), or ''. */
  value: string;
  onChange: (value: string) => void;
}

/** Text of a plain number as shown to the user: '.' groups thousands, ',' is the decimal separator. */
function display(value: string): string {
  if (value === '') return '';
  const [int, dec] = value.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === undefined ? grouped : `${grouped},${dec}`;
}

/** Keeps digits and one decimal comma; the thousands dots the user sees are not part of the value. */
function parse(text: string): string {
  const cleaned = text.replace(/\./g, '').replace(/[^\d,]/g, '');
  const [int, ...rest] = cleaned.split(',');
  const dec = rest.join('');
  const intPart = int.replace(/^0+(?=\d)/, '');
  return rest.length > 0 ? `${intPart || '0'}.${dec}` : intPart;
}

/** Money field that shows thousands separators while typing. */
export default function MoneyInput({ value, onChange, ...props }: MoneyInputProps): JSX.Element {
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display(value)}
      onChange={e => onChange(parse(e.target.value))}
    />
  );
}
