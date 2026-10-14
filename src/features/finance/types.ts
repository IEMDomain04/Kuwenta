import type { AccountIconName } from './account-icons';
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
  icon?: AccountIconName;
};

export const CATEGORIES = {
  INCOME: ['Allowance', 'Service sale', 'Salary', 'Part-time Work', 'Freelance', 'Gifts', 'Other Income', 'Gift', 'Business', 'Other'],
  EXPENSE: ['Meals', 'Snacks', 'Drinks', 'Transport', 'Café', 'Groceries', 'Personal Care', 'Cleaning Supplies', 'Mobile Load', 'Mobile Data', 'Games', 'Entertainment', 'Tech', 'Accessories', 'School Supplies', 'Personal Items', 'Shopping', 'Bills', 'Fees', 'Health', 'Education', 'Family', 'Subscriptions', 'Cash-in (E-bank)', 'Cash-out (E-bank)', 'Service exchange', 'Other'],
} as const;

/** Accepted for existing records and backups, but hidden from new-entry pickers. */
export const LEGACY_EXPENSE_CATEGORIES: readonly string[] = ['Service sale', 'E-bank Cash-in', 'E-bank Cash-out', 'Food', 'Transportation', 'Snacks & Drinks', 'Mobile Load & Data', 'Games & Entertainment', 'Tech & Accessories', 'School & Personal Items'];

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
  exchange?: Exchange;
};

export type Exchange = { kind: 'E-bank Cash-in' | 'E-bank Cash-out' | 'Service sale'; paid: number; received: number; receivedAccountId: string; extraAccountId: string; earningsConfirmed: boolean };

export type Transaction = Omit<TransactionDraft, 'type'> & {
  id: string;
  type: TransactionType;
  createdAt: string; // ISO 8601 UTC timestamp
  updatedAt: string; // ISO 8601 UTC timestamp of latest edit, not a full audit history
  destinationAccountId?: string;
  sourcePurpose?: Account['purpose'];
  destinationPurpose?: Account['purpose'];
  externalName?: string;
  exchangeParentId?: string;
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

/** month is a stable period key: YYYY-MM, daily:YYYY-MM-DD, or weekly:Monday date. */
export type Budget = { month: string; category: string; limitAmount: number };
