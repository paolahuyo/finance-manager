export interface ChargeRow {
  description: string;
  amount_cop: number;
  date: string; // YYYY-MM-DD
}

export interface DetectedSubscription {
  key: string;
  name: string;
  typical_amount: number;
  months: string[];
  charges: number;
  last_date: string;
  annual_cost: number;
  /** Two charges of (almost) the same amount within a few days: worth checking with the merchant. */
  possible_duplicate: boolean;
}

const PAYMENT_PROCESSOR_PREFIX = /^(SQ|TST|AT|MERPAGO|MERCADO PAGO|PAYPAL|BOLD SA)\s*\*?\s*/;

/** Normalises a bank description to the merchant it belongs to ("STREAMLY*AB12CD" -> "STREAMLY"). */
export function merchantKey(description: string): string {
  const cleaned = description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(PAYMENT_PROCESSOR_PREFIX, '')
    .replace(/[*#]/g, ' ');
  // Words with digits are reference codes ("5R9HL27P2"), not part of the merchant name.
  const words = cleaned
    .split(/\s+/)
    .filter(w => !/\d/.test(w))
    .map(w => w.replace(/[^A-Z]/g, ''))
    .filter(w => w.length > 1);
  return words.slice(0, 3).join(' ').trim();
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const daysBetween = (a: string, b: string): number =>
  Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000;

/**
 * Finds charges that repeat month after month: the same merchant in at least two different months, about
 * one or two charges per month, and amounts that stay close (a taxi or a supermarket varies too much).
 */
export function detectSubscriptions(rows: ChargeRow[]): DetectedSubscription[] {
  const groups = new Map<string, { name: string; rows: ChargeRow[] }>();
  for (const row of rows) {
    const key = merchantKey(row.description);
    if (!key || row.amount_cop <= 0) continue;
    const group = groups.get(key) ?? { name: row.description.trim(), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const found: DetectedSubscription[] = [];
  for (const [key, group] of groups) {
    const months = [...new Set(group.rows.map(r => r.date.slice(0, 7)))].sort();
    if (months.length < 2) continue;
    if (group.rows.length / months.length > 2) continue;

    const amounts = group.rows.map(r => r.amount_cop);
    if (Math.max(...amounts) / Math.min(...amounts) > 1.6) continue;

    const sorted = [...group.rows].sort((a, b) => a.date.localeCompare(b.date));
    const possibleDuplicate = sorted.some((row, i) =>
      sorted.slice(i + 1).some(
        other =>
          daysBetween(row.date, other.date) <= 5 &&
          Math.abs(row.amount_cop - other.amount_cop) / Math.max(row.amount_cop, other.amount_cop) <= 0.01
      )
    );

    const typical = Math.round(median(amounts));
    found.push({
      key,
      name: key,
      typical_amount: typical,
      months,
      charges: group.rows.length,
      last_date: sorted[sorted.length - 1].date,
      annual_cost: typical * 12,
      possible_duplicate: possibleDuplicate
    });
  }
  return found.sort((a, b) => b.annual_cost - a.annual_cost);
}
