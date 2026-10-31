import axios from 'axios';
import type { FeeBreakdownRow, RecurringItem, CardInstallments, UpcomingPayment, Account, AccountDetail, AccountPayload, Category, ImportItem, ImportPreview, ImportResult, MonthHistoryPoint, MonthSummary, MonthTag, PaymentPlan, PlanRequest, Transaction, TransactionPayload, TrmInfo } from './types';

const http = axios.create({ baseURL: '/api' });

/** Best-effort readable message from an API error response. */
export function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; details?: string[] } | undefined;
    if (data?.details?.length) return data.details.join(' · ');
    if (data?.error) return data.error;
  }
  return fallback;
}

export const api = {
  categories: async (): Promise<Category[]> => (await http.get<Category[]>('/categories')).data,

  transactions: async (month: string): Promise<Transaction[]> =>
    (await http.get<Transaction[]>('/transactions', { params: { month } })).data,
  createTransaction: async (payload: TransactionPayload): Promise<Transaction> =>
    (await http.post<Transaction>('/transactions', payload)).data,
  updateTransaction: async (id: number, payload: TransactionPayload): Promise<Transaction> =>
    (await http.put<Transaction>(`/transactions/${id}`, payload)).data,
  deleteTransaction: async (id: number): Promise<void> => {
    await http.delete(`/transactions/${id}`);
  },

  summary: async (month: string): Promise<MonthSummary> =>
    (await http.get<MonthSummary>('/summary', { params: { month } })).data,

  summaryHistory: async (months: number): Promise<MonthHistoryPoint[]> =>
    (await http.get<MonthHistoryPoint[]>('/summary/history', { params: { months } })).data,

  monthTags: async (): Promise<MonthTag[]> => (await http.get<MonthTag[]>('/month-tags')).data,

  setMonthTag: async (month: string): Promise<void> => {
    await http.put(`/month-tags/${month}`, { tag: 'viaje' });
  },

  removeMonthTag: async (month: string): Promise<void> => {
    await http.delete(`/month-tags/${month}`);
  },

  /** Official TRM in force on `date`, or null if it cannot be fetched. */
  trmRate: async (date: string): Promise<TrmInfo | null> => {
    try {
      return (await http.get<TrmInfo>('/exchange-rate', { params: { date } })).data;
    } catch {
      return null;
    }
  },

  accounts: async (month: string): Promise<Account[]> =>
    (await http.get<Account[]>('/accounts', { params: { month } })).data,
  recurring: async (): Promise<RecurringItem[]> => (await http.get<RecurringItem[]>('/recurring')).data,
  createRecurring: async (payload: { type: 'income' | 'expense'; description: string; amount: number; category_id: number | null; day_of_month: number }): Promise<void> => {
    await http.post('/recurring', payload);
  },
  updateRecurring: async (id: number, payload: { type: 'income' | 'expense'; description: string; amount: number; category_id: number | null; day_of_month: number }): Promise<void> => {
    await http.put(`/recurring/${id}`, payload);
  },
  deleteRecurring: async (id: number): Promise<void> => {
    await http.delete(`/recurring/${id}`);
  },
  /** Creates this month's fixed items and payroll loan installments whose day has arrived. */
  applyRecurring: async (month: string, today: string): Promise<void> => {
    await http.post('/recurring/apply', null, { params: { month, today } });
  },
  installmentsByCard: async (): Promise<CardInstallments[]> =>
    (await http.get<CardInstallments[]>('/accounts/installments')).data,
  feeBreakdown: async (month: string): Promise<FeeBreakdownRow[]> =>
    (await http.get<FeeBreakdownRow[]>('/accounts/fees', { params: { month } })).data,
  upcomingPayments: async (): Promise<UpcomingPayment[]> =>
    (await http.get<UpcomingPayment[]>('/accounts/upcoming')).data,
  accountDetail: async (id: number, month: string): Promise<AccountDetail> =>
    (await http.get<AccountDetail>(`/accounts/${id}/detail`, { params: { month } })).data,
  createAccount: async (payload: AccountPayload): Promise<void> => {
    await http.post('/accounts', payload);
  },
  setDirectedPayments: async (account: Account, allows: boolean): Promise<void> => {
    await http.put(`/accounts/${account.id}`, {
      name: account.name,
      bank: account.bank,
      kind: account.kind,
      annual_rate: account.annual_rate,
      credit_limit: account.credit_limit,
      opening_balance: account.opening_balance,
      notes: account.notes,
      allows_directed_payments: allows
    });
  },
  suggestedReserve: async (today: string): Promise<number> =>
    (await http.get<{ amount: number }>('/plan/suggested-reserve', { params: { today } })).data.amount,
  paymentPlan: async (payload: PlanRequest): Promise<PaymentPlan> => (await http.post<PaymentPlan>('/plan', payload)).data,
  deleteAccount: async (id: number): Promise<void> => {
    await http.delete(`/accounts/${id}`);
  },

  /** Sends the PDF as the raw request body; the server analyses it in memory and does not store it. */
  previewImport: async (accountId: number, file: File): Promise<ImportPreview> =>
    (
      await http.post<ImportPreview>('/imports/preview', file, {
        params: { account_id: accountId },
        headers: { 'Content-Type': file.type || 'application/octet-stream' }
      })
    ).data,
  commitImport: async (accountId: number, items: ImportItem[]): Promise<ImportResult> =>
    (await http.post<ImportResult>('/imports/commit', { account_id: accountId, items })).data
};
