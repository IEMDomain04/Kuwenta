import { formatMoney } from './money';
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

/** A category limit is an allowance, not a separate pot of cash. */
export function budgetFeedback(row: ReturnType<typeof budgetReport>['rows'][number], available: number, totalRemaining: number, currentMonth: boolean) {
  const money = (value: number) => formatMoney(value, true);
  const message = row.remaining < 0 ? `${money(-row.remaining)} over budget.`
    : row.remaining === 0 ? 'Budget limit reached.'
    : row.spent === 0 ? `${money(row.remaining)} left.`
    : row.progress >= 0.8 ? `${money(row.remaining)} left; close to the limit.`
    : `${money(row.remaining)} left.`;
  const details = [row.spent === 0 ? 'No spending recorded in this category.' : `${money(row.spent)} spent of a ${money(row.limitAmount)} limit.`];
  if (!currentMonth) details.push('This is a past or future month. Current balances are not compared with it.');
  else if (available <= 0) details.push(available < 0 ? 'Available money is negative. Check account balances before spending.' : 'No available spending money is recorded. A remaining budget is not cash.');
  else if (row.remaining > available) details.push(`The budget has ${money(row.remaining)} left, but spending accounts have ${money(available)} available.`);
  else if (totalRemaining > available) details.push(`${money(available)} is available, below the ${money(totalRemaining)} left across all budgets. Prioritize upcoming essentials.`);
  else details.push(`${money(available)} is available in spending accounts. It covers remaining budget allowances; upcoming bills may still need money.`);
  if (row.remaining < 0) details.push('Review spending or adjust the limit. Changing the budget does not change your balance.');
  else if (row.progress >= 0.8) details.push('Check upcoming purchases before spending more in this category.');
  return { message, details };
}
