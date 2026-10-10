import type { Budget } from '../types';
import { validateBudget, budgetReport } from '../budgets';
import { adjacentMonth } from '../reporting';
import type { FinanceDatabase } from './database';

export async function listBudgets(db: FinanceDatabase): Promise<Budget[]> {
  const rows = await db.getAllAsync<Budget>('SELECT month, category, limitAmount FROM budgets ORDER BY month, category');
  rows.forEach(validateBudget);
  return rows.map((row) => ({ ...row }));
}
export async function saveBudget(db: FinanceDatabase, budget: Budget, creating: boolean): Promise<void> {
  validateBudget(budget);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await transaction.getFirstAsync<Budget>('SELECT * FROM budgets WHERE month = ? AND category = ?', budget.month, budget.category);
    if (creating && existing) {
      if (existing.limitAmount === budget.limitAmount) return;
      throw new Error('This category already has a budget for that month. Edit it instead.');
    }
    if (!creating && !existing) throw new Error('Budget no longer exists.');
    const rows = await listBudgets(transaction);
    budgetReport([...rows.filter((row) => row.month !== budget.month || row.category !== budget.category), budget], [], budget.month);
    await transaction.runAsync('INSERT INTO budgets(month, category, limitAmount) VALUES (?, ?, ?) ON CONFLICT(month, category) DO UPDATE SET limitAmount = excluded.limitAmount', budget.month, budget.category, budget.limitAmount);
  });
}
export async function deleteBudget(db: FinanceDatabase, month: string, category: string): Promise<void> {
  validateBudget({ month, category, limitAmount: 1 });
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM budgets WHERE month = ? AND category = ?', month, category);
  });
}
export async function copyPreviousBudgets(db: FinanceDatabase, month: string): Promise<void> {
  const previous = adjacentMonth(month, -1);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const rows = await listBudgets(transaction);
    const current = rows.filter((row) => row.month === month);
    const missing = rows.filter((row) => row.month === previous && !current.some((budget) => budget.category === row.category)).map((row) => ({ ...row, month }));
    budgetReport([...current, ...missing], [], month);
    for (const row of missing) await transaction.runAsync('INSERT INTO budgets(month, category, limitAmount) VALUES (?, ?, ?)', month, row.category, row.limitAmount);
  });
}
