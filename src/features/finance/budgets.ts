import { formatMoney } from './money';
import { CATEGORIES, LEGACY_EXPENSE_CATEGORIES, type Budget, type Transaction } from './types';
import { budgetPeriodRange, isBudgetPeriodKey } from './budget-periods';


/** Cash-in/out are entry modes; their actual expense category is Fees. */
export const BUDGET_CATEGORIES = CATEGORIES.EXPENSE.filter(category => category !== 'Cash-in (E-bank)' && category !== 'Cash-out (E-bank)');

export function validateBudget(budget: Budget): void {
  if (!isBudgetPeriodKey(budget.month)) throw new Error('Choose a valid budget period.');
  if (!(CATEGORIES.EXPENSE as readonly string[]).includes(budget.category) && !LEGACY_EXPENSE_CATEGORIES.includes(budget.category)) throw new Error('Choose an expense category.');
  if (!Number.isSafeInteger(budget.limitAmount) || budget.limitAmount <= 0) throw new Error('Budget limit must be positive integer centavos.');
}
export function budgetReport(budgets: readonly Budget[], transactions: readonly Transaction[], month: string) {
  const range = budgetPeriodRange(month);
  const amounts = new Map<string, number>();
  for (const row of transactions) {
    if (row.type !== 'EXPENSE' || row.transactionDate < range.start || row.transactionDate > range.end) continue;
    const total = (amounts.get(row.category) ?? 0) + row.amount;
    if (!Number.isSafeInteger(total)) throw new Error('Category spending exceeds the supported range.');
    amounts.set(row.category, total);
  }
  const spending = [...amounts].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
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
    if (budgetedSpent > Number.MAX_SAFE_INTEGER - row.spent) throw new Error('Budget spending exceeds the supported range.');
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
  if (!currentMonth) details.push('This is a past or future period. Current balances are not compared with it.');
  else if (available <= 0) details.push(available < 0 ? 'Available money is negative. Check account balances before spending.' : 'No available spending money is recorded. A remaining budget is not cash.');
  else if (row.remaining > available) details.push(`The budget has ${money(row.remaining)} left, but spending accounts have ${money(available)} available.`);
  else if (totalRemaining > available) details.push(`${money(available)} is available, below the ${money(totalRemaining)} left across all budgets. Prioritize upcoming essentials.`);
  else details.push(`${money(available)} is available in spending accounts. It covers remaining budget allowances; upcoming bills may still need money.`);
  if (row.remaining < 0) details.push('Review spending or adjust the limit. Changing the budget does not change your balance.');
  else if (row.progress >= 0.8) details.push('Check upcoming purchases before spending more in this category.');
  return { message, details };
}

/** Reorder previewed cards in their existing slots, preserving every hidden category. */
export function mergeBudgetOrder(all: readonly string[], visible: readonly string[]): string[] {
  if (new Set(all).size !== all.length || new Set(visible).size !== visible.length || visible.some(category => !all.includes(category))) throw new Error('Budgets changed. Try rearranging them again.');
  const selected = new Set(visible);
  let index = 0;
  return all.map(category => selected.has(category) ? visible[index++] : category);
}


/** Separate dated allowances: overlapping periods must never share a grand total. */
export function budgetGroups(budgets: readonly Budget[], transactions: readonly Transaction[], period: 'all' | import('./budget-periods').BudgetPeriod = 'all') {
  const ranks = { daily: 0, weekly: 1, monthly: 2 };
  const byScope = new Map<string, Budget[]>();
  for (const budget of budgets) {
    const rows = byScope.get(budget.month) ?? [];
    rows.push(budget); byScope.set(budget.month, rows);
  }
  const scopes = [...byScope.keys()].map(scope => ({ scope, ...budgetPeriodRange(scope) })).filter(range => period === 'all' || range.period === period);
  scopes.sort((a, b) => ranks[a.period] - ranks[b.period] || b.start.localeCompare(a.start));
  return scopes.map(range => {
    const report = budgetReport(byScope.get(range.scope)!, transactions, range.scope);
    return { ...range, ...report, positiveRemaining: report.rows.reduce((sum, row) => sum + Math.max(0, row.remaining), 0) };
  });
}
