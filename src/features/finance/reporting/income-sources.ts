import { incomeCategory, type Transaction } from '../domain/types';
/** Group actual income only; transfers, opening balances and borrowing are excluded. */
export function incomeSources(transactions: readonly Transaction[], start: string, end: string) {
  const totals = new Map<string, number>(); let total = 0;
  for (const row of transactions) {
    if (row.type !== 'INCOME' || row.transactionDate < start || row.transactionDate > end) continue;
    if (!Number.isSafeInteger(row.amount) || row.amount <= 0 || !Number.isSafeInteger(total + row.amount)) throw new Error('Income exceeds the supported range.');
    total += row.amount; const category = incomeCategory(row.category);
    totals.set(category, (totals.get(category) ?? 0) + row.amount);
  }
  return { total, rows: [...totals].map(([category, amount]) => ({ category, amount })).sort((a,b) => b.amount - a.amount || a.category.localeCompare(b.category)) };
}
