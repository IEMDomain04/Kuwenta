import { CATEGORIES, type Budget, type Transaction } from './types';
import { isValidMonth } from './dates';
import { spendingByCategory } from './reporting';

export function validateBudget(budget: Budget): void {
  if (!isValidMonth(budget.month)) throw new Error('Choose a valid budget month.');
  if (!(CATEGORIES.EXPENSE as readonly string[]).includes(budget.category)) throw new Error('Choose an expense category.');
  if (!Number.isSafeInteger(budget.limitAmount) || budget.limitAmount <= 0) throw new Error('Budget limit must be positive integer centavos.');
}
export function budgetReport(budgets: readonly Budget[], transactions: readonly Transaction[], month: string) {
  const spending = spendingByCategory(transactions, month);
  const keys = new Set<string>();
  const rows = budgets.filter((budget) => budget.month === month).map((budget) => {
    validateBudget(budget);
    if (keys.has(budget.category)) throw new Error('Duplicate category budget.');
    keys.add(budget.category);
    const spent = spending.find((row) => row.category === budget.category)?.amount ?? 0;
    return { ...budget, spent, remaining: budget.limitAmount - spent, progress: spent / budget.limitAmount,
      status: spent > budget.limitAmount ? 'Over budget' : spent === budget.limitAmount ? 'Limit reached' : 'Within budget' };
  });
  let totalLimit = 0;
  let budgetedSpent = 0;
  for (const row of rows) {
    if (totalLimit > Number.MAX_SAFE_INTEGER - row.limitAmount) throw new Error('Total budget exceeds the supported range.');
    totalLimit += row.limitAmount; budgetedSpent += row.spent;
  }
  const unbudgeted = spending.filter((row) => !keys.has(row.category));
  return { rows, totalLimit, budgetedSpent, remaining: totalLimit - budgetedSpent, unbudgeted };
}
