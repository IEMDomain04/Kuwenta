import { budgetRenewals, budgetPredecessorToStop } from '../budget-renewal';
import { philippineDateTime } from '../dates';
import { budgetPeriodRange, isBudgetPeriodKey } from '../budget-periods';
import type { Budget } from '../types';
import { validateBudget, budgetReport } from '../budgets';
import { adjacentMonth } from '../reporting';
import type { FinanceDatabase } from './database';

export async function listBudgets(db: FinanceDatabase): Promise<Budget[]> {
  const stored = await db.getAllAsync<Omit<Budget, 'repeat'> & { repeat: number | null }>('SELECT month, category, limitAmount, repeat FROM budgets ORDER BY month, category');
  const rows: Budget[] = stored.map(({ repeat, ...row }) => {
    if (repeat !== null && repeat !== 0 && repeat !== 1) throw new Error('Invalid stored budget renewal setting.');
    return { ...row, ...(repeat === null ? {} : { repeat: repeat === 1 }) };
  });
  rows.forEach(validateBudget);
  const preference = await db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'budgetOrder'");
  const orders = readOrders(preference?.value);
  const ranks = new Map(Object.entries(orders).map(([month, categories]) => [month, new Map(categories.map((category, index) => [category, index]))]));
  rows.sort((a, b) => a.month.localeCompare(b.month) || (ranks.get(a.month)?.get(a.category) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.month)?.get(b.category) ?? Number.MAX_SAFE_INTEGER));
  return rows.map((row) => ({ ...row }));
}
export async function saveBudget(db: FinanceDatabase, budget: Budget, creating: boolean, original?: Pick<Budget, 'month' | 'category'>): Promise<void> {
  validateBudget(budget);
  const today = philippineDateTime().transactionDate;
  if (original) validateBudget({ ...original, limitAmount: 1 });
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const rows = await listBudgets(transaction);
    const existing = rows.find(row => row.month === budget.month && row.category === budget.category);
    if (creating && existing) {
      if (existing.limitAmount === budget.limitAmount) return;
      throw new Error('This category already has a budget for that period. Edit it instead.');
    }
    const moving = !creating && original && (original.month !== budget.month || original.category !== budget.category);
    if (moving) {
      if (!await transaction.getFirstAsync('SELECT category FROM budgets WHERE month = ? AND category = ?', original.month, original.category)) throw new Error('Budget no longer exists.');
      if (existing) throw new Error('This category already has a budget for that period. Choose another period.');
    } else if (!creating && !existing) throw new Error('Budget no longer exists.');
    budgetReport([...rows.filter((row) => row.month !== budget.month || row.category !== budget.category), budget], [], budget.month);
    if (moving) {
      const previous = budgetPredecessorToStop(rows, original, today);
      if (previous) await transaction.runAsync('UPDATE budgets SET repeat = 0 WHERE month = ? AND category = ?', previous.month, previous.category);
      await transaction.runAsync('UPDATE budgets SET month = ?, category = ?, limitAmount = ?, repeat = ? WHERE month = ? AND category = ?', budget.month, budget.category, budget.limitAmount, budget.repeat === undefined ? null : Number(budget.repeat), original.month, original.category);
      return;
    }
    const repeat = budget.repeat ?? (budgetPeriodRange(budget.month).end < today ? existing?.repeat : undefined);
    await transaction.runAsync('INSERT INTO budgets(month, category, limitAmount, repeat) VALUES (?, ?, ?, ?) ON CONFLICT(month, category) DO UPDATE SET limitAmount = excluded.limitAmount, repeat = excluded.repeat', budget.month, budget.category, budget.limitAmount, repeat === undefined ? null : Number(repeat));
  });
}
export async function deleteBudget(db: FinanceDatabase, month: string, category: string): Promise<void> {
  validateBudget({ month, category, limitAmount: 1 });
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const previous = budgetPredecessorToStop(await listBudgets(transaction), { month, category }, philippineDateTime().transactionDate);
    if (previous) await transaction.runAsync('UPDATE budgets SET repeat = 0 WHERE month = ? AND category = ?', previous.month, previous.category);
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
    return Object.fromEntries(Object.entries(parsed).filter(([month, categories]) => isBudgetPeriodKey(month) && Array.isArray(categories) && categories.every(category => typeof category === 'string') && new Set(categories).size === categories.length));
  } catch { return {}; }
}

/** Display preference only; never changes budget limits or financial records. */
export async function saveBudgetOrder(db: FinanceDatabase, month: string, categories: readonly string[]): Promise<void> {
  if (!isBudgetPeriodKey(month)) throw new Error('Choose a valid budget month.');
  await db.withExclusiveTransactionAsync(async transaction => {
    const rows = await transaction.getAllAsync<{ category: string }>('SELECT category FROM budgets WHERE month = ?', month);
    if (categories.length !== rows.length || new Set(categories).size !== categories.length || rows.some(row => !categories.includes(row.category))) throw new Error('Budgets changed. Try rearranging them again.');
    const preference = await transaction.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'budgetOrder'");
    const orders = readOrders(preference?.value);
    orders[month] = [...categories];
    await transaction.runAsync("INSERT INTO preferences(key, value) VALUES ('budgetOrder', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(orders));
  });
}

/** Called on launch, resume and day changes. Rechecks inside the atomic write for idempotency. */
export async function renewBudgets(db: FinanceDatabase, today: string): Promise<Budget[]> {
  const existing = await listBudgets(db);
  if (!budgetRenewals(existing, today).length) return existing;
  let result = existing;
  await db.withExclusiveTransactionAsync(async transaction => {
    const rows = await listBudgets(transaction);
    const additions = budgetRenewals(rows, today);
    const all = [...rows, ...additions.map(row => row.budget)];
    for (const scope of new Set(additions.map(row => row.budget.month))) budgetReport(all, [], scope);
    for (const { budget } of additions) {
      await transaction.runAsync('INSERT OR IGNORE INTO budgets(month,category,limitAmount,repeat) VALUES (?,?,?,?)', budget.month,budget.category,budget.limitAmount,budget.repeat === undefined ? null : Number(budget.repeat));
    }
    const preference = await transaction.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'budgetOrder'");
    const orders = readOrders(preference?.value);
    for (const { budget, previousScope } of additions) {
      if (!orders[budget.month] && orders[previousScope]) orders[budget.month] = [...orders[previousScope]];
    }
    if (JSON.stringify(orders) !== (preference?.value ?? '{}')) await transaction.runAsync("INSERT INTO preferences(key,value) VALUES ('budgetOrder',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(orders));
    result = await listBudgets(transaction);
  });
  return result;
}
