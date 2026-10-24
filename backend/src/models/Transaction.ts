import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import { monthRange } from '../utils/month';
import { FEE_CATEGORIES, INTEREST_CATEGORY } from './Account';

export type TransactionType = 'income' | 'expense' | 'payment';
export type Currency = 'COP' | 'USD';

export interface ITransaction {
  id: number;
  type: TransactionType;
  description: string;
  amount_cop: number;
  original_amount: number;
  original_currency: Currency;
  exchange_rate: number;
  category_id: number | null;
  category_name: string | null;
  account_id: number | null;
  account_name: string | null;
  /** Purchase a "PAGO COMPRA ESPECIF." payment settled, when it could be determined. */
  linked_purchase: { description: string; purchase_date: string; original_value: number; balance: number } | null;
  date: string;
}

export interface TransactionInput {
  type: TransactionType;
  description: string;
  amount_cop: number;
  original_amount: number;
  original_currency: Currency;
  exchange_rate: number;
  category_id: number | null;
  account_id: number | null;
  date: string;
}

export interface CategoryTotal {
  category_id: number | null;
  category_name: string;
  total: number;
}

const SELECT_WITH_CATEGORY = `
  SELECT t.id, t.type, t.description, t.amount_cop, t.original_amount,
         t.original_currency, t.exchange_rate, t.category_id,
         c.name AS category_name, t.account_id, a.name AS account_name, t.linked_purchase, t.date
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts a ON a.id = t.account_id
`;

export class Transaction {
  /** Purchases charged to credit cards in a month, without interest or bank fees. */
  static async cardPurchases(month: string): Promise<number> {
    const { start, end } = monthRange(month);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(t.amount_cop), 0) AS total
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id AND a.kind = 'credit_card'
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type = 'expense' AND t.date >= ? AND t.date < ?
         AND (c.name IS NULL OR c.name NOT IN (?))`,
      [start, end, [INTEREST_CATEGORY, ...FEE_CATEGORIES]]
    );
    return Number(rows[0]?.total ?? 0);
  }

  static async findByMonth(month: string): Promise<ITransaction[]> {
    const { start, end } = monthRange(month);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `${SELECT_WITH_CATEGORY} WHERE t.date >= ? AND t.date < ? ORDER BY t.date DESC, t.id DESC`,
      [start, end]
    );
    return rows as ITransaction[];
  }

  static async findByAccount(accountId: number, limit = 200): Promise<ITransaction[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `${SELECT_WITH_CATEGORY} WHERE t.account_id = ? ORDER BY t.date DESC, t.id DESC LIMIT ?`,
      [accountId, limit]
    );
    return rows as ITransaction[];
  }

  static async findById(id: number): Promise<ITransaction | undefined> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `${SELECT_WITH_CATEGORY} WHERE t.id = ?`,
      [id]
    );
    return rows[0] as ITransaction | undefined;
  }

  static async create(data: TransactionInput): Promise<ITransaction> {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT INTO transactions
        (type, description, amount_cop, original_amount, original_currency, exchange_rate, category_id, account_id, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.type, data.description, data.amount_cop, data.original_amount,
        data.original_currency, data.exchange_rate, data.category_id, data.account_id, data.date
      ]
    );
    return (await this.findById(result.insertId)) as ITransaction;
  }

  static async update(id: number, data: TransactionInput): Promise<ITransaction | undefined> {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE transactions SET type = ?, description = ?, amount_cop = ?, original_amount = ?,
         original_currency = ?, exchange_rate = ?, category_id = ?, account_id = ?, date = ? WHERE id = ?`,
      [
        data.type, data.description, data.amount_cop, data.original_amount,
        data.original_currency, data.exchange_rate, data.category_id, data.account_id, data.date, id
      ]
    );
    return result.affectedRows ? this.findById(id) : undefined;
  }

  /** Rows of one account in a date range, used to spot the same movement coming from another source. */
  static async brief(accountId: number, startDate: string, endDate: string): Promise<{ type: TransactionType; date: string; amount_cop: number }[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT type, date, amount_cop FROM transactions WHERE account_id = ? AND date BETWEEN ? AND ?',
      [accountId, startDate, endDate]
    );
    return rows.map(r => ({ type: r.type as TransactionType, date: r.date as string, amount_cop: Number(r.amount_cop) }));
  }

  /** Hashes that were already imported, so previews can flag duplicates. */
  static async existingImportHashes(hashes: string[]): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT import_hash FROM transactions WHERE import_hash IN (?)',
      [hashes]
    );
    return new Set(rows.map(r => r.import_hash as string));
  }

  /** Inserts one imported row; returns false when the same hash already exists. */
  static async createImported(data: TransactionInput, importHash: string): Promise<boolean> {
    const [result] = await getPool().query<ResultSetHeader>(
      `INSERT IGNORE INTO transactions
        (type, description, amount_cop, original_amount, original_currency, exchange_rate, category_id, account_id, date, import_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.type, data.description, data.amount_cop, data.original_amount, data.original_currency,
        data.exchange_rate, data.category_id, data.account_id, data.date, importHash
      ]
    );
    return result.affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await getPool().query<ResultSetHeader>(
      'DELETE FROM transactions WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async totalsByType(month: string): Promise<{ income: number; expense: number; payment: number }> {
    const { start, end } = monthRange(month);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT type, SUM(amount_cop) AS total FROM transactions
       WHERE date >= ? AND date < ? GROUP BY type`,
      [start, end]
    );
    const totals = { income: 0, expense: 0, payment: 0 };
    for (const row of rows) totals[row.type as TransactionType] = Number(row.total);
    return totals;
  }

  static async totalsByCategory(month: string, type: 'income' | 'expense'): Promise<CategoryTotal[]> {
    const { start, end } = monthRange(month);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT t.category_id, COALESCE(c.name, 'Sin categoría') AS category_name,
              SUM(t.amount_cop) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.date >= ? AND t.date < ? AND t.type = ?
       GROUP BY t.category_id, c.name
       ORDER BY total DESC`,
      [start, end, type]
    );
    return rows.map(r => ({
      category_id: r.category_id,
      category_name: r.category_name,
      total: Number(r.total)
    }));
  }
}
