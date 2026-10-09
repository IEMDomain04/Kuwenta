import { calculateAccountSummary } from './calculations';
import { isUtcTimestamp } from './dates';
import type { Account, Transaction } from './types';
import { validateAccount, validateManualRecord } from './validation';

export type FinanceBackup = {
  format: 'kuwenta-finance';
  version: 1;
  currency: 'PHP';
  timezone: 'Asia/Manila';
  exportedAt: string;
  accounts: Account[];
  transactions: Transaction[];
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
  const root = object(value, ['format', 'version', 'currency', 'timezone', 'exportedAt', 'accounts', 'transactions']);
  if (root.format !== 'kuwenta-finance' || root.version !== 1) {
    throw new Error('Unsupported backup format or version.');
  }
  if (root.currency !== 'PHP' || root.timezone !== 'Asia/Manila') {
    throw new Error('Backup must use PHP and Philippine transaction time.');
  }
  if (typeof root.exportedAt !== 'string' || !isUtcTimestamp(root.exportedAt)) {
    throw new Error('Backup export timestamp must be ISO UTC.');
  }
  if (!Array.isArray(root.accounts) || root.accounts.length !== 1 || !Array.isArray(root.transactions)) {
    throw new Error('The current backup version requires one Cash account and a transaction list.');
  }
  const accountRow = object(root.accounts[0], [
    'id', 'name', 'currency', 'openingBalance', 'purpose', 'includedInAvailable', 'archived',
  ]);
  strings(accountRow, ['id', 'name', 'currency', 'purpose']);
  // Runtime types are checked by validateAccount after the string guards above.
  const account = { ...accountRow } as Account;
  validateAccount(account);
  if (account.id !== 'cash') throw new Error('Only the Cash account is supported in this backup version.');

  const ids = new Set<string>();
  const transactions = root.transactions.map((value) => {
    const row = object(value, [
      'id', 'type', 'amount', 'accountId', 'category', 'transactionDate',
      'transactionTime', 'notes', 'createdAt', 'updatedAt',
    ]);
    strings(row, ['id', 'type', 'accountId', 'category', 'transactionDate', 'transactionTime', 'createdAt', 'updatedAt']);
    const transaction = { ...row } as Transaction;
    validateManualRecord(transaction);
    if (transaction.accountId !== account.id) throw new Error('Backup transaction references an unknown account.');
    if (ids.has(transaction.id)) throw new Error('Backup contains duplicate transaction IDs.');
    ids.add(transaction.id);
    return transaction;
  });

  // Reject overflow in the resulting balance and in every reporting month's totals.
  calculateAccountSummary(account, transactions, '1900-01');
  const months = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const month = transaction.transactionDate.slice(0, 7);
    const rows = months.get(month) ?? [];
    rows.push(transaction);
    months.set(month, rows);
  }
  for (const [month, rows] of months) {
    calculateAccountSummary({ ...account, openingBalance: 0 }, rows, month);
  }
  return {
    format: 'kuwenta-finance', version: 1, currency: 'PHP', timezone: 'Asia/Manila',
    exportedAt: root.exportedAt, accounts: [account], transactions,
  };
}

/** Internal plaintext payload only; file export and encryption are separate steps. */
export function serializeBackup(
  account: Account,
  transactions: readonly Transaction[],
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify(validateBackup({
    format: 'kuwenta-finance', version: 1, currency: 'PHP', timezone: 'Asia/Manila',
    exportedAt, accounts: [account], transactions,
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
  incomeCount: number;
  expenseCount: number;
  cashBalance: number;
} {
  const validated = validateBackup(backup);
  return {
    exportedAt: validated.exportedAt,
    transactionCount: validated.transactions.length,
    incomeCount: validated.transactions.filter((row) => row.type === 'INCOME').length,
    expenseCount: validated.transactions.filter((row) => row.type === 'EXPENSE').length,
    cashBalance: calculateAccountSummary(validated.accounts[0], validated.transactions, '1900-01').balance,
  };
}

