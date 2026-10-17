import { RowDataPacket } from 'mysql2';
import { getPool } from '../db/init';

export type CategoryType = 'income' | 'expense';

export interface ICategory {
  id: number;
  name: string;
  type: CategoryType;
}

export class Category {
  static async findAll(): Promise<ICategory[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT id, name, type FROM categories ORDER BY type, name'
    );
    return rows as ICategory[];
  }

  static async findById(id: number): Promise<ICategory | undefined> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      'SELECT id, name, type FROM categories WHERE id = ?',
      [id]
    );
    return rows[0] as ICategory | undefined;
  }
}
