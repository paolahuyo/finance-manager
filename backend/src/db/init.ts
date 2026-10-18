import mysql from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';
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
  ['Intereses y comisiones', 'expense'],
  ['Otros gastos', 'expense']
];

export async function initDb(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    console.log('✅ Database connected');

    // Credit cards, loans and personal debts. Balance = opening_balance + charges - payments.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        bank VARCHAR(100) NULL,
        kind ENUM('credit_card', 'loan', 'personal') NOT NULL DEFAULT 'credit_card',
        annual_rate DECIMAL(6, 2) NULL,
        credit_limit DECIMAL(15, 2) NULL,
        opening_balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
        balance_as_of DATE NULL,
        notes VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    // Date up to which opening_balance already reflects the movements (statement cut-off).
    const [asOfCols] = await connection.query<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'accounts' AND column_name = 'balance_as_of'`
    );
    if (asOfCols.length === 0) {
      await connection.query('ALTER TABLE accounts ADD COLUMN balance_as_of DATE NULL AFTER opening_balance');
    }

    // amount_cop is the source of truth for every total. For foreign-currency
    // entries we keep the original amount and the rate used, for traceability.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type ENUM('income', 'expense', 'payment') NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount_cop DECIMAL(15, 2) NOT NULL,
        original_amount DECIMAL(15, 2) NOT NULL,
        original_currency ENUM('COP', 'USD') NOT NULL DEFAULT 'COP',
        exchange_rate DECIMAL(12, 4) NOT NULL DEFAULT 1,
        category_id INT NULL,
        account_id INT NULL,
        import_hash CHAR(64) NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_import_hash (import_hash),
        INDEX idx_date (date),
        INDEX idx_account (account_id),
        CONSTRAINT fk_transaction_category FOREIGN KEY (category_id)
          REFERENCES categories(id) ON DELETE SET NULL,
        CONSTRAINT fk_transaction_account FOREIGN KEY (account_id)
          REFERENCES accounts(id) ON DELETE SET NULL
      )
    `);

    // Idempotent upgrade for databases created before accounts existed.
    await connection.query(
      "ALTER TABLE transactions MODIFY type ENUM('income', 'expense', 'payment') NOT NULL"
    );
    const [cols] = await connection.query<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'account_id'`
    );
    if (cols.length === 0) {
      await connection.query(`
        ALTER TABLE transactions
          ADD COLUMN account_id INT NULL AFTER category_id,
          ADD INDEX idx_account (account_id),
          ADD CONSTRAINT fk_transaction_account FOREIGN KEY (account_id)
            REFERENCES accounts(id) ON DELETE SET NULL
      `);
    }

    // Statement imports tag each row with a hash so re-importing the same file cannot duplicate it.
    const [hashCols] = await connection.query<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'import_hash'`
    );
    if (hashCols.length === 0) {
      await connection.query(
        'ALTER TABLE transactions ADD COLUMN import_hash CHAR(64) NULL, ADD UNIQUE KEY uniq_import_hash (import_hash)'
      );
    }

    // Installment table of each statement ("photo" at the cut-off), used to link payments to purchases.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS statement_installments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        cutoff DATE NOT NULL,
        purchase_date DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        original_value DECIMAL(15, 2) NOT NULL,
        installment_no INT NOT NULL,
        installments_total INT NOT NULL,
        balance_before DECIMAL(15, 2) NOT NULL,
        capital_paid DECIMAL(15, 2) NOT NULL,
        balance_after DECIMAL(15, 2) NOT NULL,
        rate DECIMAL(6, 2) NOT NULL,
        INDEX idx_account_cutoff (account_id, cutoff),
        CONSTRAINT fk_installment_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);
    const [linkCols] = await connection.query<RowDataPacket[]>(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'linked_purchase'`
    );
    if (linkCols.length === 0) {
      await connection.query('ALTER TABLE transactions ADD COLUMN linked_purchase JSON NULL');
    }

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
