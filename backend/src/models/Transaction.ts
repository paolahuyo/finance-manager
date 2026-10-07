import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import { monthRange } from '../utils/month';
import { TransactionType } from './Category';

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
         c.name AS category_name, t.date
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;

export class Transaction {
  static async findByMonth(month: string): Promise<ITransaction[]> {
    const { start, end } = monthRange(month);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `${SELECT_WITH_CATEGORY} WHERE t.date >= ? AND t.date < ? ORDER BY t.date DESC, t.id DESC`,
      [start, end]
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
        (type, description, amount_cop, original_amount, original_currency, exchange_rate, category_id, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.type, data.description, data.amount_cop, data.original_amount,
        data.original_currency, data.exchange_rate, data.category_id, data.date
      ]
    );
    return (await this.findById(result.insertId)) as ITransaction;
  }

  static async update(id: number, data: TransactionInput): Promise<ITransaction | undefined> {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE transactions SET type = ?, description = ?, amount_cop = ?, original_amount = ?,
         original_currency = ?, exchange_rate = ?, category_id = ?, date = ? WHERE id = ?`,
      [
        data.type, data.description, data.amount_cop, data.original_amount,
        data.original_currency, data.exchange_rate, data.category_id, data.date, id
      ]
    );
    return result.affectedRows ? this.findById(id) : undefined;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await getPool().query<ResultSetHeader>(
      'DELETE FROM transactions WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async totalsByType(month: string): Promise<{ income: number; expense: number }> {
    const { start, end } = monthRange(month);
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT type, SUM(amount_cop) AS total FROM transactions
       WHERE date >= ? AND date < ? GROUP BY type`,
      [start, end]
    );
    const totals = { income: 0, expense: 0 };
    for (const row of rows) totals[row.type as TransactionType] = Number(row.total);
    return totals;
  }

  static async totalsByCategory(month: string, type: TransactionType): Promise<CategoryTotal[]> {
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
