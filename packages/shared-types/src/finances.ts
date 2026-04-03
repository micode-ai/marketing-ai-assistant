// packages/shared-types/src/finances.ts

export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'PLN', 'RUB', 'UAH', 'BYN', 'KZT', 'TRY', 'JPY', 'CNY',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export type FinanceRecordType = 'INCOME' | 'EXPENSE';
export type FinanceCategoryType = 'INCOME' | 'EXPENSE' | 'BOTH';

export interface FinanceCategory {
  id: string;
  projectId: string;
  name: string;
  type: FinanceCategoryType;
  isDefault: boolean;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinanceRecord {
  id: string;
  projectId: string;
  categoryId: string;
  category?: FinanceCategory;
  type: FinanceRecordType;
  amount: number;
  currency: string;
  amountInBaseCurrency: number;
  exchangeRate: number;
  description?: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFinanceRecordDto {
  projectId: string;
  categoryId: string;
  type: FinanceRecordType;
  amount: number;
  currency: string;
  description?: string;
  date: string;
}

export interface UpdateFinanceRecordDto {
  categoryId?: string;
  type?: FinanceRecordType;
  amount?: number;
  currency?: string;
  description?: string;
  date?: string;
}

export interface CreateFinanceCategoryDto {
  projectId: string;
  name: string;
  type: FinanceCategoryType;
  color: string;
}

export interface UpdateFinanceCategoryDto {
  name?: string;
  type?: FinanceCategoryType;
  color?: string;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  baseCurrency: string;
  incomeByCategory: { categoryId: string; name: string; color: string; total: number }[];
  expenseByCategory: { categoryId: string; name: string; color: string; total: number }[];
  monthlyData: { month: string; income: number; expense: number }[];
}

export interface ExchangeRateResponse {
  rate: number;
  date: string;
}
