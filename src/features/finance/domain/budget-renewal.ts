import { budgetPeriodKey, budgetPeriodRange } from './budget-periods';
import type { Budget } from './types';

/** Undefined is the legacy/default repeating behavior. False stops a series at this period. */
export function latestBudgetSources(budgets: readonly Budget[], today: string): Budget[] {
  budgetPeriodKey('daily', today);
  const latest = new Map<string, Budget>();
  const dated = budgets.map(budget => ({ budget, range: budgetPeriodRange(budget.month) }))
    .filter(({ range }) => range.start <= today).sort((a,b) => b.range.start.localeCompare(a.range.start));
  for (const { budget, range } of dated) {
    const key = range.period + ':' + budget.category;
    if (!latest.has(key)) latest.set(key, budget);
  }
  return [...latest.values()];
}
/** Create only the current missing period, never fill every missed day/week/month. */
export function budgetRenewals(budgets: readonly Budget[], today: string): { budget: Budget; previousScope: string }[] {
  return latestBudgetSources(budgets, today).flatMap(source => {
    const { period } = budgetPeriodRange(source.month);
    const month = budgetPeriodKey(period, today);
    if (source.repeat === false || source.month === month || budgets.some(row => row.month === month && row.category === source.category)) return [];
    return [{ budget: { ...source, month }, previousScope: source.month }];
  });
}
/** A deleted latest period must not cause an older allowance to reappear tomorrow. */
export function budgetPredecessorToStop(budgets: readonly Budget[], removed: Pick<Budget,'month'|'category'>, today: string): Budget | undefined {
  if (!latestBudgetSources(budgets, today).some(row => row.month === removed.month && row.category === removed.category)) return;
  const period = budgetPeriodRange(removed.month).period;
  return latestBudgetSources(budgets.filter(row => row.month !== removed.month || row.category !== removed.category), today)
    .find(row => row.category === removed.category && budgetPeriodRange(row.month).period === period);
}
