import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'finance_manager',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // DECIMAL -> number and DATE -> 'YYYY-MM-DD' instead of string/Date objects
  decimalNumbers: true,
  dateStrings: true
});

const DEFAULT_CATEGORIES: ReadonlyArray<readonly [string, 'income' | 'expense']> = [
  ['Salario', 'income'],
  ['Honorarios', 'income'],
  ['Inversiones', 'income'],
  ['Otros ingresos', 'income'],
  ['Vivienda', 'expense'],
  ['Alimentación', 'expense'],
  ['Transporte', 'expense'],
  ['Servicios públicos', 'expense'],
  ['Salud', 'expense'],
  ['Educación', 'expense'],
  ['Entretenimiento', 'expense'],
  ['Ropa', 'expense'],
  ['Pago de deudas', 'expense'],
  ['Otros gastos', 'expense']
];

export async function initDb(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    console.log('✅ Database connected');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS debts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        interest_rate DECIMAL(5, 2) DEFAULT 0,
        min_payment DECIMAL(15, 2),
        status ENUM('active', 'paid') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type ENUM('income', 'expense') NOT NULL,
        UNIQUE KEY uniq_category (name, type)
      )
    `);

    // amount_cop is the source of truth for every total. For foreign-currency
    // entries we keep the original amount and the rate used, for traceability.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type ENUM('income', 'expense') NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount_cop DECIMAL(15, 2) NOT NULL,
        original_amount DECIMAL(15, 2) NOT NULL,
        original_currency ENUM('COP', 'USD') NOT NULL DEFAULT 'COP',
        exchange_rate DECIMAL(12, 4) NOT NULL DEFAULT 1,
        category_id INT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_date (date),
        CONSTRAINT fk_transaction_category FOREIGN KEY (category_id)
          REFERENCES categories(id) ON DELETE SET NULL
      )
    `);

    await connection.query(
      'INSERT IGNORE INTO categories (name, type) VALUES ?',
      [DEFAULT_CATEGORIES.map(([name, type]) => [name, type])]
    );

    console.log('✅ Tables initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    connection.release();
  }
}

export function getPool() {
  return pool;
}
