import { validateBudget, budgetReport } from './budgets';
import { calculateAccountSummary, calculateFinanceSummary, calculateGoalProgress } from './calculations';
import { isUtcTimestamp } from './dates';
import type { Account, Transaction, SavingsGoal, Budget } from './types';
import { validateAccount, validateManualRecord, validateGoal } from './validation';

export type FinanceBackup = {
  format: 'kuwenta-finance';
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  currency: 'PHP';
  timezone: 'Asia/Manila';
  exportedAt: string;
  accounts: Account[];
  transactions: Transaction[];
  goals?: SavingsGoal[];
  budgets?: Budget[];
};

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Backup must contain valid objects.');
  }
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !keys.includes(key) && row[key] !== undefined)) {
    throw new Error('Backup contains unsupported fields.');
  }
  return row;
}

function strings(row: Record<string, unknown>, keys: readonly string[]): void {
  if (keys.some((key) => typeof row[key] !== 'string')) {
    throw new Error('Backup contains missing or invalid text fields.');
  }
}

/** Validate the complete payload before a future restore writes anything. */
function validateBackup(value: unknown): FinanceBackup {
  const root = object(value, ['format', 'version', 'currency', 'timezone', 'exportedAt', 'accounts', 'transactions', 'goals', 'budgets']);
  if (root.format !== 'kuwenta-finance' || (root.version !== 1 && root.version !== 2 && root.version !== 3 && root.version !== 4 && root.version !== 5 && root.version !== 6 && root.version !== 7 && root.version !== 8)) {
    throw new Error('Unsupported backup format or version.');
  }
  if (root.currency !== 'PHP' || root.timezone !== 'Asia/Manila') {
    throw new Error('Backup currency or transaction timezone is incompatible.');
  }
  if (typeof root.exportedAt !== 'string' || !isUtcTimestamp(root.exportedAt)) {
    throw new Error('Backup export timestamp must be ISO UTC.');
  }
  if (!Array.isArray(root.accounts) || !root.accounts.length || !Array.isArray(root.transactions)) {
    throw new Error('Backup requires accounts and a transaction list.');
  }
  const accountIds = new Set<string>();
  const accounts = root.accounts.map((value) => {
    const row = object(value, ['id', 'name', 'currency', 'openingBalance', 'purpose', 'includedInAvailable', 'archived', 'color']);
    strings(row, ['id', 'name', 'currency', 'purpose']);
    const account = { ...row } as Account;
    validateAccount(account);
    if (account.color !== undefined && root.version !== 8) throw new Error('Account colors require backup version 8.');
    if (accountIds.has(account.id)) throw new Error('Backup contains duplicate account IDs.');
    accountIds.add(account.id);
    return account;
  });
  if (!accountIds.has('cash')) throw new Error('Backup must contain the Cash account.');
  if (root.version === 1 && (accounts.length !== 1 || accounts[0].id !== 'cash')) throw new Error('Version 1 backups support only Cash.');
  const ids = new Set<string>();
  const transactions = root.transactions.map((value) => {
    const row = object(value, [
      'id', 'type', 'amount', 'accountId', 'category', 'transactionDate',
      'transactionTime', 'notes', 'createdAt', 'updatedAt', 'adjustmentDirection', 'destinationAccountId', 'sourcePurpose', 'destinationPurpose', 'externalName',
    ]);
    strings(row, ['id', 'type', 'accountId', 'category', 'transactionDate', 'transactionTime', 'createdAt', 'updatedAt']);
    const transaction = { ...row } as Transaction;
    validateManualRecord(transaction);
    if (transaction.type === 'EXTERNAL' && root.version !== 7 && root.version !== 8) throw new Error('External movements require backup version 7.');
    if (root.version !== 5 && root.version !== 6 && root.version !== 7 && root.version !== 8 && (transaction.sourcePurpose !== undefined || transaction.destinationPurpose !== undefined)) throw new Error('Transfer purposes require backup version 5.');
    if ((root.version === 1 || root.version === 2) && transaction.type === 'ADJUSTMENT') throw new Error('Balance adjustments require backup version 3.');
    if ((root.version === 1 || root.version === 2 || root.version === 3) && transaction.type === 'TRANSFER') throw new Error('Transfers require backup version 4.');
    if (!accountIds.has(transaction.accountId) || transaction.type === 'TRANSFER' && !accountIds.has(transaction.destinationAccountId!)) throw new Error('Backup transaction references an unknown account.');
    if (ids.has(transaction.id)) throw new Error('Backup contains duplicate transaction IDs.');
    ids.add(transaction.id);
    return transaction;
  });

  if (root.goals !== undefined && ((root.version !== 5 && root.version !== 6 && root.version !== 7 && root.version !== 8) || !Array.isArray(root.goals))) throw new Error('Goals require a valid version 5 backup.');
  const goalIds = new Set<string>();
  const goalAccounts = new Set<string>();
  const goals = ((root.goals ?? []) as unknown[]).map((value) => {
    const goal = { ...object(value, ['id', 'name', 'accountId', 'targetAmount', 'targetDate', 'createdAt', 'updatedAt']) } as SavingsGoal;
    validateGoal(goal, accounts);
    if (goalIds.has(goal.id) || goalAccounts.has(goal.accountId)) throw new Error('Duplicate goal or goal account.');
    goalIds.add(goal.id); goalAccounts.add(goal.accountId);
    calculateGoalProgress(goal, accounts, transactions);
    return goal;
  });
  if (root.budgets !== undefined && (root.version !== 6 && root.version !== 7 && root.version !== 8 || !Array.isArray(root.budgets))) throw new Error('Budgets require backup version 6.');
  const budgetKeys = new Set<string>();
  const budgets = ((root.budgets ?? []) as unknown[]).map((value) => {
    const budget = { ...object(value, ['month', 'category', 'limitAmount']) } as Budget;
    validateBudget(budget);
    const key = budget.month + ':' + budget.category;
    if (budgetKeys.has(key)) throw new Error('Duplicate category budget.');
    budgetKeys.add(key);
    return budget;
  });
  for (const month of new Set(budgets.map((row) => row.month))) budgetReport(budgets, transactions, month);
  // Reject overflow in the resulting balance and in every reporting month's totals.
  calculateFinanceSummary(accounts, transactions, '1900-01');
  const months = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const month = transaction.transactionDate.slice(0, 7);
    const rows = months.get(month) ?? [];
    rows.push(transaction);
    months.set(month, rows);
  }
  for (const [month, rows] of months) {
    calculateFinanceSummary(accounts.map((account) => ({ ...account, openingBalance: 0 })), rows, month);
  }
  return {
    format: 'kuwenta-finance', version: root.version, currency: 'PHP', timezone: 'Asia/Manila',
    exportedAt: root.exportedAt, accounts, transactions, goals: root.version >= 5 ? goals : undefined, budgets: root.version >= 6 ? budgets : undefined,
  };
}

/** Internal plaintext payload only; file export and encryption are separate steps. */
export function serializeBackup(
  account: Account | readonly Account[],
  transactions: readonly Transaction[],
  exportedAt = new Date().toISOString(),
  goals: readonly SavingsGoal[] = [],
  budgets: readonly Budget[] = [],
): string {
  const accounts: readonly Account[] = Array.isArray(account) ? account : [account as Account];
  return JSON.stringify(validateBackup({
    format: 'kuwenta-finance', version: accounts.some(row => row.color !== undefined) ? 8 : transactions.some((row) => row.type === 'EXTERNAL') ? 7 : 6, currency: 'PHP', timezone: 'Asia/Manila',
    exportedAt, accounts, transactions, goals, budgets,
  }), null, 2);
}

export function parseBackup(json: string): FinanceBackup {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('Backup is not valid JSON.');
  }
  return validateBackup(value);
}

export function previewBackup(backup: FinanceBackup): {
  exportedAt: string;
  transactionCount: number;
  accountCount: number;
  incomeCount: number;
  expenseCount: number;
  adjustmentCount: number;
  externalCount: number;
  transferCount: number;
  goalCount: number;
  budgetCount: number;
  cashBalance: number;
} {
  const validated = validateBackup(backup);
  return {
    exportedAt: validated.exportedAt,
    goalCount: validated.goals?.length ?? 0,
    budgetCount: validated.budgets?.length ?? 0,
    transactionCount: validated.transactions.length,
    accountCount: validated.accounts.length,
    incomeCount: validated.transactions.filter((row) => row.type === 'INCOME').length,
    expenseCount: validated.transactions.filter((row) => row.type === 'EXPENSE').length,
    transferCount: validated.transactions.filter((row) => row.type === 'TRANSFER').length,
    externalCount: validated.transactions.filter((row) => row.type === 'EXTERNAL').length,
    adjustmentCount: validated.transactions.filter((row) => row.type === 'ADJUSTMENT').length,
    cashBalance: calculateAccountSummary(validated.accounts.find((account) => account.id === 'cash')!, validated.transactions, '1900-01').balance,
  };
}

