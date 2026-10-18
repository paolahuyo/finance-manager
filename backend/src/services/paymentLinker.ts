import { RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import { Installment } from '../models/Installment';
import { matchSpecialPayments } from './linkPayments';

/** Links this card's unlinked "PAGO COMPRA ESPECIF." payments using the stored statement snapshots. */
export async function linkAccountPayments(accountId: number): Promise<number> {
  const snapshots = await Installment.snapshots(accountId);
  if (snapshots.length === 0) return 0;
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, date, amount_cop FROM transactions
     WHERE account_id = ? AND type = 'payment' AND description LIKE 'PAGO COMPRA ESPEC%' AND linked_purchase IS NULL`,
    [accountId]
  );
  const links = matchSpecialPayments(
    rows.map(r => ({ id: r.id as number, date: r.date as string, amount: Number(r.amount_cop) })),
    snapshots
  );
  for (const link of links) {
    await getPool().query('UPDATE transactions SET linked_purchase = ? WHERE id = ?', [
      JSON.stringify({
        description: link.purchase.description,
        purchase_date: link.purchase.purchase_date,
        original_value: link.purchase.original_value,
        balance: link.purchase.balance_after
      }),
      link.paymentId
    ]);
  }
  return links.length;
}
