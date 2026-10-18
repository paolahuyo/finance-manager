export type TransactionType = 'income' | 'expense' | 'payment';
export type CategoryType = 'income' | 'expense';
export type Currency = 'COP' | 'USD';

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
}

export interface Transaction {
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
  linked_purchase: { description: string; purchase_date: string; original_value: number; balance: number } | null;
  date: string;
}

export interface TransactionPayload {
  type: TransactionType;
  description: string;
  amount: number;
  currency: Currency;
  exchange_rate?: number;
  category_id: number | null;
  account_id: number | null;
  date: string;
}

export interface CategoryTotal {
  category_id: number | null;
  category_name: string;
  total: number;
}

export interface MonthSummary {
  month: string;
  income: number;
  expense: number;
  payments: number;
  interest: number;
  fees: number;
  balance: number;
  expenseByCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
}

export type AccountKind = 'credit_card' | 'loan' | 'personal';

export interface Account {
  id: number;
  name: string;
  bank: string | null;
  kind: AccountKind;
  annual_rate: number | null;
  credit_limit: number | null;
  opening_balance: number;
  balance_as_of: string | null;
  notes: string | null;
  balance: number;
  month_interest: number;
  year_interest: number;
  month_payments: number;
  month_fees: number;
  year_fees: number;
}

export interface AccountPayload {
  name: string;
  bank: string;
  kind: AccountKind;
  annual_rate: string;
  credit_limit: string;
  opening_balance: string;
}

export interface TrmInfo {
  usd_cop: number;
  source: 'TRM';
  /** First day the returned TRM was in force. */
  valid_from: string;
  /** False when the requested date had no published TRM and the latest earlier one was used. */
  exact: boolean;
}

export type ImportKind = 'purchase' | 'interest' | 'fee' | 'payment' | 'credit';

export interface ImportItem {
  import_hash: string;
  date: string;
  description: string;
  amount_cop: number;
  kind: ImportKind;
  category_id: number | null;
  original_amount?: number;
  original_currency?: 'USD';
  exchange_rate?: number;
  note?: string;
  duplicate: boolean;
  selected: boolean;
}

export interface ImportPreview {
  format?: 'pdf' | 'excel';
  bank: string;
  period_start: string | null;
  period_end: string | null;
  skipped_installments: number;
  warnings: string[];
  linked_payments?: number;
  items: ImportItem[];
}

export interface ImportResult {
  inserted: number;
  skipped_duplicates: number;
  linked_payments?: number;
}

export interface InstallmentRow {
  purchase_date: string;
  description: string;
  original_value: number;
  installment_no: number;
  installments_total: number;
  balance_before: number;
  capital_paid: number;
  balance_after: number;
  rate: number;
}

export interface AccountDetail {
  account: Account;
  installments: { cutoff: string; rows: InstallmentRow[] } | null;
  directed_payments: { total: number; linked: number; items: Transaction[] };
  movements: Transaction[];
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
