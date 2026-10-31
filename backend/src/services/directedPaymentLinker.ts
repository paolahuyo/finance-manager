import { getPool } from '../db/init';
import { Installment } from '../models/Installment';
import { matchDirectedPayment, PurchaseLink } from './directedPayments';

/**
 * Links each "PAGO COMPRA ESPECIF." payment made after the latest statement to the purchase it paid, so the
 * purchase list shows its balance now and not the one printed in the statement. Safe to run more than once;
 * payments it cannot place with certainty stay unlinked. Returns how many it linked.
 */
export async function linkPendingDirectedPayments(accountId: number): Promise<number> {
  const first = await Installment.latest(accountId);
  if (!first) return 0;
  const [pending] = await getPool().query<import('mysql2').RowDataPacket[]>(
    `SELECT id, description, amount_cop FROM transactions
     WHERE account_id = ? AND type = 'payment' AND linked_purchase IS NULL
       AND description LIKE 'PAGO COMPRA ESPECIF%' AND date >= ?
     ORDER BY date, id`,
    [accountId, first.cutoff]
  );
  let linked = 0;
  for (const payment of pending) {
    // Read the rows again each time: an earlier payment may already have lowered a balance.
    const current = await Installment.latest(accountId);
    const row = current && matchDirectedPayment(String(payment.description), Number(payment.amount_cop), current.rows);
    if (!row) continue;
    const link: PurchaseLink = {
      description: row.description,
      purchase_date: row.purchase_date,
      balance: row.statement_balance,
      original_value: row.original_value
    };
    await getPool().query('UPDATE transactions SET linked_purchase = ? WHERE id = ?', [JSON.stringify(link), payment.id]);
    linked += 1;
  }
  return linked;
}
