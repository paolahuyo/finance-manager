import axios from 'axios';
import type { Category, Debt, MonthSummary, Transaction, TransactionPayload } from './types';

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

  usdCopRate: async (): Promise<number | null> => {
    try {
      return (await http.get<{ usd_cop: number }>('/exchange-rate')).data.usd_cop;
    } catch {
      return null;
    }
  },

  debts: async (): Promise<Debt[]> => (await http.get<Debt[]>('/debts')).data,
  createDebt: async (data: Record<string, unknown>): Promise<void> => {
    await http.post('/debts', data);
  },
  deleteDebt: async (id: number): Promise<void> => {
    await http.delete(`/debts/${id}`);
  }
};
