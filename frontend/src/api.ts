import axios from 'axios';
import type { UpcomingPayment, Account, AccountDetail, AccountPayload, Category, ImportItem, ImportPreview, ImportResult, MonthSummary, Transaction, TransactionPayload, TrmInfo } from './types';

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
  deleteTransaction: async (id: number): Promise<void> => {
    await http.delete(`/transactions/${id}`);
  },

  summary: async (month: string): Promise<MonthSummary> =>
    (await http.get<MonthSummary>('/summary', { params: { month } })).data,

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
  upcomingPayments: async (): Promise<UpcomingPayment[]> =>
    (await http.get<UpcomingPayment[]>('/accounts/upcoming')).data,
  accountDetail: async (id: number, month: string): Promise<AccountDetail> =>
    (await http.get<AccountDetail>(`/accounts/${id}/detail`, { params: { month } })).data,
  createAccount: async (payload: AccountPayload): Promise<void> => {
    await http.post('/accounts', payload);
  },
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
