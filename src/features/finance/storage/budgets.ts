import { isValidMonth } from '../dates';
import type { Budget } from '../types';
import { validateBudget, budgetReport } from '../budgets';
import { adjacentMonth } from '../reporting';
import type { FinanceDatabase } from './database';

export async function listBudgets(db: FinanceDatabase): Promise<Budget[]> {
  const rows = await db.getAllAsync<Budget>('SELECT month, category, limitAmount FROM budgets ORDER BY month, category');
  rows.forEach(validateBudget);
  const preference = await db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'budgetOrder'");
  const orders = readOrders(preference?.value);
  const ranks = new Map(Object.entries(orders).map(([month, categories]) => [month, new Map(categories.map((category, index) => [category, index]))]));
  rows.sort((a, b) => a.month.localeCompare(b.month) || (ranks.get(a.month)?.get(a.category) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.month)?.get(b.category) ?? Number.MAX_SAFE_INTEGER));
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

function readOrders(value?: string): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([month, categories]) => isValidMonth(month) && Array.isArray(categories) && categories.every(category => typeof category === 'string') && new Set(categories).size === categories.length));
  } catch { return {}; }
}

/** Display preference only; never changes budget limits or financial records. */
export async function saveBudgetOrder(db: FinanceDatabase, month: string, categories: readonly string[]): Promise<void> {
  if (!isValidMonth(month)) throw new Error('Choose a valid budget month.');
  await db.withExclusiveTransactionAsync(async transaction => {
    const rows = await transaction.getAllAsync<{ category: string }>('SELECT category FROM budgets WHERE month = ?', month);
    if (categories.length !== rows.length || new Set(categories).size !== categories.length || rows.some(row => !categories.includes(row.category))) throw new Error('Budgets changed. Try rearranging them again.');
    const preference = await transaction.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'budgetOrder'");
    const orders = readOrders(preference?.value);
    orders[month] = [...categories];
    await transaction.runAsync("INSERT INTO preferences(key, value) VALUES ('budgetOrder', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(orders));
  });
}
