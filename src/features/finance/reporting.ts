import { isValidMonth } from './dates';
import type { ManualTransactionType, Transaction } from './types';
export function adjacentMonth(month: string, direction: -1 | 1): string {
  if (!isValidMonth(month)) throw new Error('Invalid reporting month.');
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + direction;
  const result = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
  if (!isValidMonth(result)) throw new Error('Month is outside the supported range.');
  return result;
}
export function filterTransactions(transactions: readonly Transaction[], month: string, type: 'ALL' | ManualTransactionType = 'ALL'): Transaction[] {
  if (!isValidMonth(month)) throw new Error('Invalid reporting month.');
  return transactions.filter((row) => row.transactionDate.slice(0, 7) === month && (type === 'ALL' || row.type === type));
}

/** Selected-month expense totals, in exact integer centavos. Input records are already validated by storage. */
export function spendingByCategory(transactions: readonly Transaction[], month: string): { category: string; amount: number }[] {
  const totals = new Map<string, number>();
  let total = 0;
  for (const row of filterTransactions(transactions, month, 'EXPENSE')) {
    if (!Number.isSafeInteger(row.amount) || row.amount <= 0 || total > Number.MAX_SAFE_INTEGER - row.amount) {
      throw new Error('Spending total exceeds the supported range or contains an invalid amount.');
    }
    total += row.amount;
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount);
  }
  return [...totals].map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}