/**
 * Links "PAGO COMPRA ESPECIF." payments to the purchase they paid off.
 *
 * A payment that settles a purchase equals, to the cent, that purchase's outstanding balance in the
 * statement right before the payment, and the purchase is gone from the statement right after it.
 * A link is only made when exactly one purchase fits; otherwise the payment stays unlinked.
 */
export interface SnapshotRow {
  purchase_date: string;
  description: string;
  original_value: number;
  balance_after: number;
}

export interface Snapshot {
  cutoff: string;
  rows: SnapshotRow[];
}

export interface PaymentToLink {
  id: number;
  date: string;
  amount: number;
}

export interface Link {
  paymentId: number;
  purchase: SnapshotRow;
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.02;
const purchaseKey = (r: SnapshotRow): string => `${r.purchase_date}|${r.original_value.toFixed(2)}`;

export function matchSpecialPayments(payments: PaymentToLink[], snapshots: Snapshot[]): Link[] {
  const ordered = [...snapshots].sort((a, b) => a.cutoff.localeCompare(b.cutoff));
  const links: Link[] = [];
  const used = new Set<string>();

  for (const payment of [...payments].sort((a, b) => a.date.localeCompare(b.date))) {
    const before = [...ordered].reverse().find(s => s.cutoff < payment.date);
    if (!before) continue;
    const after = ordered.find(s => s.cutoff >= payment.date);
    const stillThere = new Set(after ? after.rows.map(purchaseKey) : []);

    const candidates = before.rows.filter(
      r => r.balance_after > 0 && near(r.balance_after, payment.amount) &&
        !stillThere.has(purchaseKey(r)) && !used.has(`${before.cutoff}|${purchaseKey(r)}`)
    );
    if (candidates.length !== 1) continue;
    used.add(`${before.cutoff}|${purchaseKey(candidates[0])}`);
    links.push({ paymentId: payment.id, purchase: candidates[0] });
  }
  return links;
}
