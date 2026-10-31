export interface PurchaseRow {
  description: string;
  purchase_date: string;
  /** Balance of the purchase after the payments made since the statement. */
  balance_after: number;
  /** Balance of the purchase as printed in the statement. */
  statement_balance: number;
}

/** What a directed payment remembers about the purchase it paid (kept in transactions.linked_purchase). */
export interface PurchaseLink {
  description: string;
  purchase_date: string;
  /** Statement balance of the purchase when the payment was made: with the description and date it identifies the row. */
  balance: number;
  original_value?: number;
}

export interface LinkedPayment {
  amount_cop: number;
  linked: PurchaseLink;
}

const EPSILON = 0.01;
const normalize = (text: string): string => text.toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * Finds which purchase of the latest statement a "PAGO COMPRA ESPECIF." payment is meant for: the purchase whose
 * description appears in the payment text, or - when several share it, or none does - the one whose open balance
 * equals the amount exactly. Returns null when it cannot tell (never guesses).
 */
export function matchDirectedPayment<T extends PurchaseRow>(paymentDescription: string, amount: number, rows: T[]): T | null {
  const text = normalize(paymentDescription);
  const open = rows.filter(r => r.balance_after > EPSILON && amount <= r.balance_after + EPSILON);
  const exactly = (list: T[]): T[] => list.filter(r => Math.abs(r.balance_after - amount) < EPSILON);

  const byName = open.filter(r => text.includes(normalize(r.description)));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    const exact = exactly(byName);
    return exact.length === 1 ? exact[0] : null;
  }
  const exact = exactly(open);
  return exact.length === 1 ? exact[0] : null;
}

/** Subtracts, from a purchase's statement balance, what was paid to it since the statement. */
export function balanceAfterPayments(
  row: { description: string; purchase_date: string; balance_after: number },
  payments: LinkedPayment[]
): { balance_after: number; paid_since: number } {
  const paid = payments
    .filter(
      p =>
        p.linked.description === row.description &&
        p.linked.purchase_date === row.purchase_date &&
        Math.abs(p.linked.balance - row.balance_after) < EPSILON
    )
    .reduce((total, p) => total + p.amount_cop, 0);
  return { balance_after: Math.max(Math.round((row.balance_after - paid) * 100) / 100, 0), paid_since: Math.round(paid * 100) / 100 };
}
