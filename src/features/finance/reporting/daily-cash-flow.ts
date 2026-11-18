import type { Transaction } from '../domain/types';
export function dailyCashFlow(transactions: readonly Transaction[], start: string, end: string) {
  const totals = new Map<string, { income: number; expenses: number }>();
  for (const row of transactions) {
    if ((row.type !== 'INCOME' && row.type !== 'EXPENSE') || row.transactionDate < start || row.transactionDate > end) continue;
    const day = totals.get(row.transactionDate) ?? { income: 0, expenses: 0 };
    const field = row.type === 'INCOME' ? 'income' : 'expenses';
    if (!Number.isSafeInteger(row.amount) || row.amount <= 0 || !Number.isSafeInteger(day[field] + row.amount)) throw new Error('Daily activity exceeds the supported range.');
    day[field] += row.amount; totals.set(row.transactionDate, day);
  }
  const days = [];
  for (let cursor = new Date(start + 'T12:00:00Z'); cursor.toISOString().slice(0,10) <= end; cursor.setUTCDate(cursor.getUTCDate()+1)) {
    const date = cursor.toISOString().slice(0,10);
    days.push({ date, ...(totals.get(date) ?? { income: 0, expenses: 0 }) });
    if (date === end) break;
  }
  return days;
}
