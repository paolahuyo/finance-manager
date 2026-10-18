import { RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import type { InstallmentRow } from '../importers/types';
import type { Snapshot } from '../services/linkPayments';

export interface InstallmentDetail {
  purchase_date: string;
  description: string;
  original_value: number;
  installment_no: number;
  installments_total: number;
  balance_before: number;
  capital_paid: number;
  balance_after: number;
  rate: number;
}

export class Installment {
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
    return { cutoff, rows: rows as InstallmentDetail[] };
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
