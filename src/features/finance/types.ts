import type { AccountCardColor } from './account-colors';

/** All monetary fields are integer centavos. Only PHP is supported. */
export type Account = {
  id: string;
  name: string;
  currency: 'PHP';
  openingBalance: number;
  purpose: 'spending' | 'savings';
  includedInAvailable: boolean;
  archived: boolean;
  color?: AccountCardColor;
};

export const CATEGORIES = {
  INCOME: ['Allowance', 'Salary', 'Part-time Work', 'Freelance', 'Gifts', 'Other Income', 'Gift', 'Business', 'Other'],
  EXPENSE: ['Meals', 'Snacks', 'Drinks', 'Transport', 'Café', 'Groceries', 'Personal Care', 'Cleaning Supplies', 'Mobile Load', 'Mobile Data', 'Games', 'Entertainment', 'Tech', 'Accessories', 'School Supplies', 'Personal Items', 'Shopping', 'Bills', 'Fees', 'Health', 'Education', 'Family', 'Subscriptions', 'Other'],
} as const;

/** Accepted for existing records and backups, but hidden from new-entry pickers. */
export const LEGACY_EXPENSE_CATEGORIES: readonly string[] = ['Food', 'Transportation', 'Snacks & Drinks', 'Mobile Load & Data', 'Games & Entertainment', 'Tech & Accessories', 'School & Personal Items'];

export type ManualTransactionType = keyof typeof CATEGORIES | 'TRANSFER';
export type TransactionType = ManualTransactionType | 'TRANSFER' | 'ADJUSTMENT' | 'EXTERNAL';

/** Date and time describe when money moved, always in Philippine time (UTC+8). */
export type TransactionDraft = {
  type: ManualTransactionType;
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  category: string;
  transactionDate: string; // YYYY-MM-DD, Philippine calendar date
  transactionTime: string; // HH:mm:ss, Philippine 24-hour time
  notes?: string;
};

export type Transaction = Omit<TransactionDraft, 'type'> & {
  id: string;
  type: TransactionType;
  createdAt: string; // ISO 8601 UTC timestamp
  updatedAt: string; // ISO 8601 UTC timestamp of latest edit, not a full audit history
  destinationAccountId?: string;
  sourcePurpose?: Account['purpose'];
  destinationPurpose?: Account['purpose'];
  externalName?: string;
  adjustmentDirection?: 'increase' | 'decrease';
};

export type SavingsGoal = {
  id: string;
  name: string;
  accountId: string;
  targetAmount: number;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type Budget = { month: string; category: string; limitAmount: number };
