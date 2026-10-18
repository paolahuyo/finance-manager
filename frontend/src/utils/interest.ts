import type { InstallmentRow } from '../types';

/** Interest one month of this balance generates at the purchase's effective annual rate. */
export function monthlyInterest(r: InstallmentRow): number {
  if (r.rate <= 0 || r.balance_after <= 0) return 0;
  return r.balance_after * (Math.pow(1 + r.rate / 100, 1 / 12) - 1);
}
