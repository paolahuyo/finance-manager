import { createHash } from 'node:crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';
import { monthRange } from '../utils/month';

export interface IRecurring {
  id: number;
  type: 'income' | 'expense';
  description: string;
  amount_cop: number;
  category_id: number | null;
  category_name: string | null;
  day_of_month: number;
}

export interface RecurringInput {
  type: 'income' | 'expense';
  description: string;
  amount_cop: number;
  category_id: number | null;
  day_of_month: number;
}

/** Date of a monthly item in a given month; day 31 becomes the last day of shorter months. */
export function occurrenceDate(month: string, day: number): string {
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(year, mon, 0).getDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** One generated movement per item and month, so applying twice never duplicates. */
const occurrenceHash = (id: number, month: string): string =>
  createHash('sha256').update(`recurring|${id}|${month}`).digest('hex');

export class Recurring {
  static async findAll(): Promise<IRecurring[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT r.id, r.type, r.description, r.amount_cop, r.category_id, c.name AS category_name, r.day_of_month
       FROM recurring_items r LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.active = 1 ORDER BY r.day_of_month, r.type`
    );
    return rows.map(r => ({ ...(r as IRecurring), amount_cop: Number(r.amount_cop) }));
  }

  static async create(data: RecurringInput): Promise<number> {
    const [result] = await getPool().query<ResultSetHeader>(
      'INSERT INTO recurring_items (type, description, amount_cop, category_id, day_of_month) VALUES (?, ?, ?, ?, ?)',
      [data.type, data.description, data.amount_cop, data.category_id, data.day_of_month]
    );
    return result.insertId;
  }

  static async update(id: number, data: RecurringInput): Promise<boolean> {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE recurring_items SET type = ?, description = ?, amount_cop = ?, category_id = ?, day_of_month = ?
       WHERE id = ? AND active = 1`,
      [data.type, data.description, data.amount_cop, data.category_id, data.day_of_month, id]
    );
    return result.affectedRows > 0;
  }

  static async deactivate(id: number): Promise<boolean> {
    const [result] = await getPool().query<ResultSetHeader>('UPDATE recurring_items SET active = 0 WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  /**
   * Creates the movements of `month` whose day has already arrived (up to `today`).
   * Future ones are only shown as planned. Returns how many were created.
   */
  static async apply(month: string, today: string): Promise<number> {
    const { start } = monthRange(month);
    let created = 0;
    for (const item of await this.findAll()) {
      const date = occurrenceDate(month, item.day_of_month);
      if (date < start || date > today) continue;
      const [result] = await getPool().query<ResultSetHeader>(
        `INSERT IGNORE INTO transactions
          (type, description, amount_cop, original_amount, original_currency, exchange_rate, category_id, account_id, date, import_hash)
         VALUES (?, ?, ?, ?, 'COP', 1, ?, NULL, ?, ?)`,
        [item.type, item.description, item.amount_cop, item.amount_cop, item.category_id, date, occurrenceHash(item.id, month)]
      );
      created += result.affectedRows;
    }
    return created;
  }
}
