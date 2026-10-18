export type DraftKind = 'purchase' | 'interest' | 'fee' | 'payment' | 'credit';

/** One movement proposed by a statement reader. Nothing is saved until the user confirms. */
export interface DraftItem {
  date: string; // YYYY-MM-DD
  description: string;
  amount_cop: number;
  kind: DraftKind;
  original_amount?: number;
  original_currency?: 'USD';
  exchange_rate?: number;
  note?: string;
  /** Pre-checked in the review screen. */
  selected: boolean;
}

/** What the statement says about the card itself; used to create the account without typing it. */
export interface AccountHint {
  credit_limit: number | null;
  /** Debt at the statement cut-off date. */
  balance: number | null;
  /** Effective annual rate, in %. */
  annual_rate: number | null;
}

export interface ParsedStatement {
  bank: 'BBVA' | 'Nu' | 'Banco de Bogotá';
  period_start: string | null;
  period_end: string | null;
  items: DraftItem[];
  /** Installment lines of purchases made in earlier periods (already counted when they happened). */
  skipped_installments: number;
  warnings: string[];
  account_hint: AccountHint;
}

/** Lines of text per page, as rebuilt from the PDF (columns separated by 3+ spaces). */
export type StatementPages = string[][];

export interface StatementReader {
  bank: ParsedStatement['bank'];
  detect(pages: StatementPages): boolean;
  parse(pages: StatementPages): ParsedStatement;
}
