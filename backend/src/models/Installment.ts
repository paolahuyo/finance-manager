import { RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import type { InstallmentRow } from '../importers/types';
import type { Snapshot } from '../services/linkPayments';
import { balanceAfterPayments, LinkedPayment, PurchaseLink } from '../services/directedPayments';

export interface InstallmentDetail {
  purchase_date: string;
  description: string;
  original_value: number;
  installment_no: number;
  installments_total: number;
  balance_before: number;
  capital_paid: number;
  /** Balance now: the statement balance minus what was paid to this purchase since the statement. */
  balance_after: number;
  rate: number;
  /** Balance as printed in the statement. */
  statement_balance: number;
  /** Paid to this purchase (directed payments) after the statement cut-off. */
  paid_since: number;
}

type StatementRow = Omit<InstallmentDetail, 'statement_balance' | 'paid_since'>;

export class Installment {
  /** Directed payments made after each card's cut-off, grouped by card. */
  private static async paymentsSince(cutoffs: { account_id: number; cutoff: string }[]): Promise<Map<number, LinkedPayment[]>> {
    const result = new Map<number, LinkedPayment[]>();
    if (cutoffs.length === 0) return result;
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT account_id, amount_cop, date, linked_purchase FROM transactions
       WHERE type = 'payment' AND linked_purchase IS NOT NULL AND account_id IN (?)`,
      [cutoffs.map(c => c.account_id)]
    );
    const cutoffOf = new Map(cutoffs.map(c => [c.account_id, c.cutoff]));
    for (const r of rows) {
      if (String(r.date) < (cutoffOf.get(r.account_id as number) ?? '')) continue;
      const linked = (typeof r.linked_purchase === 'string' ? JSON.parse(r.linked_purchase) : r.linked_purchase) as PurchaseLink;
      const list = result.get(r.account_id as number) ?? [];
      list.push({ amount_cop: Number(r.amount_cop), linked });
      result.set(r.account_id as number, list);
    }
    return result;
  }

  private static withPayments(
    row: StatementRow,
    payments: LinkedPayment[]
  ): InstallmentDetail {
    const { balance_after, paid_since } = balanceAfterPayments(row, payments);
    return { ...row, statement_balance: row.balance_after, balance_after, paid_since };
  }

  /** Latest installment table of every card that has one. */
  static async latestForAll(): Promise<{ account_id: number; account_name: string; cutoff: string; rows: InstallmentDetail[] }[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT s.account_id, a.name AS account_name, s.cutoff, s.purchase_date, s.description, s.original_value,
              s.installment_no, s.installments_total, s.balance_before, s.capital_paid, s.balance_after, s.rate
       FROM statement_installments s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.cutoff = (SELECT MAX(x.cutoff) FROM statement_installments x WHERE x.account_id = s.account_id)
       ORDER BY a.name, s.balance_after DESC`
    );
    const byAccount = new Map<number, { account_id: number; account_name: string; cutoff: string; rows: StatementRow[] }>();
    for (const r of rows) {
      const id = r.account_id as number;
      if (!byAccount.has(id)) byAccount.set(id, { account_id: id, account_name: r.account_name as string, cutoff: r.cutoff as string, rows: [] });
      byAccount.get(id)!.rows.push({
        purchase_date: r.purchase_date, description: r.description, original_value: Number(r.original_value),
        installment_no: r.installment_no, installments_total: r.installments_total, balance_before: Number(r.balance_before),
        capital_paid: Number(r.capital_paid), balance_after: Number(r.balance_after), rate: Number(r.rate)
      });
    }
    const cards = [...byAccount.values()];
    const payments = await this.paymentsSince(cards.map(c => ({ account_id: c.account_id, cutoff: c.cutoff })));
    return cards.map(card => ({ ...card, rows: card.rows.map(r => this.withPayments(r, payments.get(card.account_id) ?? [])) }));
  }

  /** Installment table of the most recent statement stored for this card. */
  static async latest(accountId: number): Promise<{ cutoff: string; rows: InstallmentDetail[] } | null> {
    const [cut] = await getPool().query<RowDataPacket[]>(
      'SELECT MAX(cutoff) AS cutoff FROM statement_installments WHERE account_id = ?',
      [accountId]
    );
    const cutoff = cut[0]?.cutoff as string | null;
    if (!cutoff) return null;
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT purchase_date, description, original_value, installment_no, installments_total,
              balance_before, capital_paid, balance_after, rate
       FROM statement_installments WHERE account_id = ? AND cutoff = ?
       ORDER BY balance_after DESC, purchase_date DESC`,
      [accountId, cutoff]
    );
    const payments = await this.paymentsSince([{ account_id: accountId, cutoff }]);
    return {
      cutoff,
      rows: rows.map(r =>
        this.withPayments(
          {
            purchase_date: r.purchase_date, description: r.description, original_value: Number(r.original_value),
            installment_no: r.installment_no, installments_total: r.installments_total, balance_before: Number(r.balance_before),
            capital_paid: Number(r.capital_paid), balance_after: Number(r.balance_after), rate: Number(r.rate)
          },
          payments.get(accountId) ?? []
        )
      )
    };
  }

  /** Stores the installment table of one statement, replacing a previous upload of the same statement. */
  static async replaceSnapshot(accountId: number, cutoff: string, rows: InstallmentRow[]): Promise<void> {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM statement_installments WHERE account_id = ? AND cutoff = ?', [accountId, cutoff]);
      if (rows.length) {
        await connection.query(
          `INSERT INTO statement_installments
            (account_id, cutoff, purchase_date, description, original_value, installment_no, installments_total,
             balance_before, capital_paid, balance_after, rate)
           VALUES ?`,
          [rows.map(r => [accountId, cutoff, r.purchase_date, r.description, r.original_value, r.installment_no,
            r.installments_total, r.balance_before, r.capital_paid, r.balance_after, r.rate])]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async snapshots(accountId: number): Promise<Snapshot[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT cutoff, purchase_date, description, original_value, balance_after
       FROM statement_installments WHERE account_id = ? ORDER BY cutoff`,
      [accountId]
    );
    const byCutoff = new Map<string, Snapshot>();
    for (const r of rows) {
      const cutoff = r.cutoff as string;
      if (!byCutoff.has(cutoff)) byCutoff.set(cutoff, { cutoff, rows: [] });
      byCutoff.get(cutoff)!.rows.push({
        purchase_date: r.purchase_date as string,
        description: r.description as string,
        original_value: Number(r.original_value),
        balance_after: Number(r.balance_after)
      });
    }
    return [...byCutoff.values()];
  }
}
