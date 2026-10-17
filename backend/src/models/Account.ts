import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import { monthRange } from '../utils/month';

export type AccountKind = 'credit_card' | 'loan' | 'personal';

export const INTEREST_CATEGORY = 'Intereses y comisiones';

export interface IAccount {
  id: number;
  name: string;
  bank: string | null;
  kind: AccountKind;
  annual_rate: number | null;
  credit_limit: number | null;
  opening_balance: number;
  notes: string | null;
}

export interface AccountInput {
  name: string;
  bank: string | null;
  kind: AccountKind;
  annual_rate: number | null;
  credit_limit: number | null;
  opening_balance: number;
  notes: string | null;
}

export interface IAccountStats extends IAccount {
  /** What is owed now: opening balance + charges - payments (all time). */
  balance: number;
  /** Interest and fees charged in the selected month. */
  month_interest: number;
  /** Interest and fees charged from January to the end of the selected month. */
  year_interest: number;
  /** Payments made in the selected month. */
  month_payments: number;
}

const COLUMNS = 'id, name, bank, kind, annual_rate, credit_limit, opening_balance, notes';

export class Account {
  static async findAll(): Promise<IAccount[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${COLUMNS} FROM accounts ORDER BY kind, name`
    );
    return rows as IAccount[];
  }

  static async findById(id: number): Promise<IAccount | undefined> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${COLUMNS} FROM accounts WHERE id = ?`,
      [id]
    );
    return rows[0] as IAccount | undefined;
  }

  /** Accounts with their balance and the interest/payments of `month` (YYYY-MM). */
  static async findAllWithStats(month: string): Promise<IAccountStats[]> {
    const { start, end } = monthRange(month);
    const yearStart = `${month.slice(0, 4)}-01-01`;
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT a.id, a.name, a.bank, a.kind, a.annual_rate, a.credit_limit, a.opening_balance, a.notes,
         a.opening_balance
           + COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cop
                               WHEN t.type = 'payment' THEN -t.amount_cop END), 0) AS balance,
         COALESCE(SUM(CASE WHEN t.type = 'expense' AND c.name = ? AND t.date >= ? AND t.date < ?
                           THEN t.amount_cop END), 0) AS month_interest,
         COALESCE(SUM(CASE WHEN t.type = 'expense' AND c.name = ? AND t.date >= ? AND t.date < ?
                           THEN t.amount_cop END), 0) AS year_interest,
         COALESCE(SUM(CASE WHEN t.type = 'payment' AND t.date >= ? AND t.date < ?
                           THEN t.amount_cop END), 0) AS month_payments
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       LEFT JOIN categories c ON c.id = t.category_id
       GROUP BY a.id
       ORDER BY a.kind, a.name`,
      [INTEREST_CATEGORY, start, end, INTEREST_CATEGORY, yearStart, end, start, end]
    );
    return rows.map(r => ({
      ...(r as IAccount),
      balance: Number(r.balance),
      month_interest: Number(r.month_interest),
      year_interest: Number(r.year_interest),
      month_payments: Number(r.month_payments)
    }));
  }

  static async create(data: AccountInput): Promise<IAccount> {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO accounts (name, bank, kind, annual_rate, credit_limit, opening_balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.bank, data.kind, data.annual_rate, data.credit_limit, data.opening_balance, data.notes]
    );
    return (await this.findById(result.insertId)) as IAccount;
  }

  static async update(id: number, data: AccountInput): Promise<IAccount | undefined> {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE accounts SET name = ?, bank = ?, kind = ?, annual_rate = ?, credit_limit = ?,
         opening_balance = ?, notes = ? WHERE id = ?`,
      [data.name, data.bank, data.kind, data.annual_rate, data.credit_limit, data.opening_balance, data.notes, id]
    );
    return result.affectedRows ? this.findById(id) : undefined;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await getPool().query<ResultSetHeader>('DELETE FROM accounts WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}
