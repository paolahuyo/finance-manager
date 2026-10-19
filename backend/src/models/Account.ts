import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import { monthRange } from '../utils/month';

export type AccountKind = 'credit_card' | 'loan' | 'personal';

export const INTEREST_CATEGORY = 'Intereses';
/** Fixed bank charges, reported apart from interest. */
export const FEE_CATEGORIES = ['Cuota de manejo', 'Seguros', 'Comisiones'] as const;

/** Category for a bank charge, from its description. */
export function feeCategoryName(description: string): (typeof FEE_CATEGORIES)[number] {
  if (/MANEJO/i.test(description)) return 'Cuota de manejo';
  if (/SEGURO/i.test(description)) return 'Seguros';
  return 'Comisiones';
}

export interface IAccount {
  id: number;
  name: string;
  bank: string | null;
  kind: AccountKind;
  annual_rate: number | null;
  credit_limit: number | null;
  opening_balance: number;
  balance_as_of: string | null;
  due_date: string | null;
  minimum_payment: number | null;
  total_payment: number | null;
  due_cutoff: string | null;
  allows_directed_payments: boolean;
  notes: string | null;
}

export interface AccountInput {
  name: string;
  bank: string | null;
  kind: AccountKind;
  annual_rate: number | null;
  credit_limit: number | null;
  opening_balance: number;
  balance_as_of: string | null;
  due_date: string | null;
  minimum_payment: number | null;
  total_payment: number | null;
  due_cutoff: string | null;
  allows_directed_payments: boolean;
  notes: string | null;
}

export interface UpcomingPayment {
  id: number;
  name: string;
  bank: string | null;
  due_date: string;
  minimum_payment: number | null;
  total_payment: number | null;
  due_cutoff: string | null;
  paid_since_cutoff: number;
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
  /** Handling fees, insurance and commissions charged in the selected month / year to date. */
  month_fees: number;
  year_fees: number;
}

const COLUMNS =
  'id, name, bank, kind, annual_rate, credit_limit, opening_balance, balance_as_of, due_date, minimum_payment, total_payment, due_cutoff, allows_directed_payments, notes';

const toAccount = (r: RowDataPacket): IAccount => ({ ...(r as IAccount), allows_directed_payments: !!r.allows_directed_payments });

export class Account {
  static async findAll(): Promise<IAccount[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${COLUMNS} FROM accounts ORDER BY kind, name`
    );
    return rows.map(toAccount);
  }

  static async findById(id: number): Promise<IAccount | undefined> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT ${COLUMNS} FROM accounts WHERE id = ?`,
      [id]
    );
    return rows[0] ? toAccount(rows[0]) : undefined;
  }

  /** Accounts with their balance and the interest/payments of `month` (YYYY-MM). */
  static async findAllWithStats(month: string): Promise<IAccountStats[]> {
    const { start, end } = monthRange(month);
    const yearStart = `${month.slice(0, 4)}-01-01`;
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT a.id, a.name, a.bank, a.kind, a.annual_rate, a.credit_limit, a.opening_balance, a.balance_as_of,
         a.due_date, a.minimum_payment, a.total_payment, a.due_cutoff, a.allows_directed_payments, a.notes,
         a.opening_balance
           + COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cop
                               WHEN t.type = 'payment' THEN -t.amount_cop END), 0) AS balance,
         COALESCE(SUM(CASE WHEN t.type = 'expense' AND c.name = ? AND t.date >= ? AND t.date < ?
                           THEN t.amount_cop END), 0) AS month_interest,
         COALESCE(SUM(CASE WHEN t.type = 'expense' AND c.name = ? AND t.date >= ? AND t.date < ?
                           THEN t.amount_cop END), 0) AS year_interest,
         COALESCE(SUM(CASE WHEN t.type = 'payment' AND t.date >= ? AND t.date < ?
                           THEN t.amount_cop END), 0) AS month_payments,
         COALESCE(SUM(CASE WHEN t.type = 'expense' AND c.name IN (?) AND t.date >= ? AND t.date < ?
                           THEN t.amount_cop END), 0) AS month_fees,
         COALESCE(SUM(CASE WHEN t.type = 'expense' AND c.name IN (?) AND t.date >= ? AND t.date < ?
                           THEN t.amount_cop END), 0) AS year_fees
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       LEFT JOIN categories c ON c.id = t.category_id
       GROUP BY a.id
       ORDER BY a.kind, a.name`,
      [INTEREST_CATEGORY, start, end, INTEREST_CATEGORY, yearStart, end, start, end,
       [...FEE_CATEGORIES], start, end, [...FEE_CATEGORIES], yearStart, end]
    );
    return rows.map(r => ({
      ...toAccount(r),
      balance: Number(r.balance),
      month_interest: Number(r.month_interest),
      year_interest: Number(r.year_interest),
      month_payments: Number(r.month_payments),
      month_fees: Number(r.month_fees),
      year_fees: Number(r.year_fees)
    }));
  }

  static async create(data: AccountInput): Promise<IAccount> {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO accounts (name, bank, kind, annual_rate, credit_limit, opening_balance, balance_as_of,
         due_date, minimum_payment, total_payment, due_cutoff, allows_directed_payments, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.bank, data.kind, data.annual_rate, data.credit_limit, data.opening_balance, data.balance_as_of,
       data.due_date, data.minimum_payment, data.total_payment, data.due_cutoff, data.allows_directed_payments ? 1 : 0, data.notes]
    );
    return (await this.findById(result.insertId)) as IAccount;
  }

  static async update(id: number, data: AccountInput): Promise<IAccount | undefined> {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE accounts SET name = ?, bank = ?, kind = ?, annual_rate = ?, credit_limit = ?,
         opening_balance = ?, balance_as_of = ?, due_date = ?, minimum_payment = ?, total_payment = ?, due_cutoff = ?,
         allows_directed_payments = ?, notes = ? WHERE id = ?`,
      [data.name, data.bank, data.kind, data.annual_rate, data.credit_limit, data.opening_balance, data.balance_as_of,
       data.due_date, data.minimum_payment, data.total_payment, data.due_cutoff, data.allows_directed_payments ? 1 : 0, data.notes, id]
    );
    return result.affectedRows ? this.findById(id) : undefined;
  }

  /** Next payment of every card that has one, with what has been paid since that statement's cut-off. */
  static async upcomingPayments(): Promise<UpcomingPayment[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT a.id, a.name, a.bank, a.due_date, a.minimum_payment, a.total_payment, a.due_cutoff,
         COALESCE((SELECT SUM(t.amount_cop) FROM transactions t
                   WHERE t.account_id = a.id AND t.type = 'payment'
                     AND (a.due_cutoff IS NULL OR t.date >= a.due_cutoff)), 0) AS paid_since_cutoff
       FROM accounts a
       WHERE a.due_date IS NOT NULL AND a.kind <> 'loan'
       ORDER BY a.due_date, a.name`
    );
    return rows.map(r => ({ ...(r as UpcomingPayment), paid_since_cutoff: Number(r.paid_since_cutoff) }));
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await getPool().query<ResultSetHeader>('DELETE FROM accounts WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}
