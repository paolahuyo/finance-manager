import { createHash } from 'node:crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import type { LoanPlanRow } from '../importers/loanPlan';

export interface LoanScheduleRow extends LoanPlanRow {
  due_date: string;
}

const installmentHash = (accountId: number, n: number): string =>
  createHash('sha256').update(`loan|${accountId}|${n}`).digest('hex');

export class Loan {
  static async replaceSchedule(accountId: number, rows: LoanScheduleRow[]): Promise<void> {
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM loan_schedule WHERE account_id = ?', [accountId]);
      if (rows.length) {
        await connection.query(
          `INSERT INTO loan_schedule (account_id, n, due_date, balance_after, capital, interest, insurance, payment) VALUES ?`,
          [rows.map(r => [accountId, r.n, r.due_date, r.balance_after, r.capital, r.interest, r.insurance, r.payment])]
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

  static async schedule(accountId: number): Promise<LoanScheduleRow[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT n, due_date, balance_after, capital, interest, insurance, payment FROM loan_schedule WHERE account_id = ? ORDER BY n',
      [accountId]
    );
    return rows.map(r => ({
      n: r.n, due_date: r.due_date, balance_after: Number(r.balance_after), capital: Number(r.capital),
      interest: Number(r.interest), insurance: Number(r.insurance), payment: Number(r.payment)
    }));
  }

  /**
   * Records installments whose date has arrived (payroll deduction). The salary is registered net, so
   * the installment must not reduce money again: only the CAPITAL is recorded, as a payment that lowers
   * the loan balance. Interest and insurance stay visible in the plan.
   */
  static async applyDue(today: string): Promise<number> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT l.account_id, a.name, l.n, l.due_date, l.capital, l.interest, l.insurance, l.payment
       FROM loan_schedule l JOIN accounts a ON a.id = l.account_id WHERE l.due_date <= ?`,
      [today]
    );
    let created = 0;
    for (const r of rows) {
      const description =
        `Cuota ${r.n} ${r.name} (descuento de nómina $${Number(r.payment).toLocaleString('es-CO')}: ` +
        `capital $${Number(r.capital).toLocaleString('es-CO')}, intereses $${Number(r.interest).toLocaleString('es-CO')}, ` +
        `seguro $${Number(r.insurance).toLocaleString('es-CO')})`;
      const [result] = await getPool().query<ResultSetHeader>(
        `INSERT IGNORE INTO transactions
          (type, description, amount_cop, original_amount, original_currency, exchange_rate, category_id, account_id, date, import_hash)
         VALUES ('payment', ?, ?, ?, 'COP', 1, NULL, ?, ?, ?)`,
        [description.slice(0, 255), r.capital, r.capital, r.account_id, r.due_date, installmentHash(r.account_id, r.n)]
      );
      created += result.affectedRows;
    }
    return created;
  }
}
