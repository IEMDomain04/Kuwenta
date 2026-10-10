/** All monetary fields are integer centavos. Only PHP is supported. */
export type Account = {
  id: string;
  name: string;
  currency: 'PHP';
  openingBalance: number;
  purpose: 'spending' | 'savings';
  includedInAvailable: boolean;
  archived: boolean;
};

export const CATEGORIES = {
  INCOME: ['Salary', 'Allowance', 'Freelance', 'Gift', 'Business', 'Other'],
  EXPENSE: ['Food', 'Transportation', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Education', 'Family', 'Subscriptions', 'Other'],
} as const;

export type ManualTransactionType = keyof typeof CATEGORIES | 'TRANSFER';
export type TransactionType = ManualTransactionType | 'TRANSFER' | 'ADJUSTMENT';

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
