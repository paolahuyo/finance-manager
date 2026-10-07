export type TransactionType = 'income' | 'expense';
export type Currency = 'COP' | 'USD';

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
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
  date: string;
}

export interface TransactionPayload {
  type: TransactionType;
  description: string;
  amount: number;
  currency: Currency;
  exchange_rate?: number;
  category_id: number | null;
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
  balance: number;
  expenseByCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
}

export interface Debt {
  id: number;
  name: string;
  amount: number;
  interest_rate: number;
  min_payment: number | null;
}
