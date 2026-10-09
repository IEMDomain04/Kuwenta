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
