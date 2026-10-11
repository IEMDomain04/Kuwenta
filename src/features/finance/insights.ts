import type { Account, Budget, SavingsGoal, Transaction } from './types';
import { calculateFinanceSummary, calculateGoalProgress, calculateSavings } from './calculations';
import { budgetReport } from './budgets';
import { adjacentMonth, spendingByCategory } from './reporting';
import { formatMoney } from './money';
import { philippineDateTime, readableReportingMonth } from './dates';

/** Offline summaries of recorded data, never predictions or financial mutations. */
export function moneyInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], goals: readonly SavingsGoal[], now = new Date()): string[] {
  const month = philippineDateTime(now).transactionDate.slice(0, 7);
  const period = readableReportingMonth(month);
  calculateFinanceSummary(accounts, transactions, month);
  const messages: string[] = [];
  const report = budgetReport(budgets, transactions, month);
  for (const row of report.rows.filter((row) => row.progress >= 0.8).sort((a, b) => b.progress - a.progress)) {
    messages.push(row.remaining < 0
      ? row.category + ' is ' + formatMoney(-row.remaining) + ' over budget for ' + period + '.'
      : row.category + ': ' + Math.round(row.progress * 100) + '% of the ' + period + ' budget used; ' + formatMoney(row.remaining) + ' remaining.');
  }
  const spending = spendingByCategory(transactions, month);
  if (spending.length) {
    const top = [...spending].sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category))[0];
    messages.push(top.category + ' is a largest expense category for ' + period + ': ' + formatMoney(top.amount) + ' recorded.');
  }
  const previous = month === '1900-01' ? month : adjacentMonth(month, -1);
  const date = philippineDateTime(now).transactionDate;
  const day = Number(date.slice(8));
  // Compare the same elapsed days; never compare a partial month to an entire month.
  const matched = transactions.filter((row) => row.transactionDate.slice(0, 7) === month || row.transactionDate.slice(0, 7) === previous && Number(row.transactionDate.slice(8)) <= day);
  const currentExpenses = matched.filter((row) => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === month && row.transactionDate <= date);
  const priorExpenses = matched.filter((row) => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === previous);
  if (currentExpenses.length && priorExpenses.length && day <= 28) {
    const current = calculateFinanceSummary(accounts, currentExpenses, month).monthlyExpenses;
    const prior = calculateFinanceSummary(accounts, priorExpenses, previous).monthlyExpenses;
    const difference = current - prior;
    messages.push('Recorded spending for days 1-' + day + ' of ' + period + ' is ' + formatMoney(Math.abs(difference)) + (difference > 0 ? ' higher' : difference < 0 ? ' lower' : ' unchanged') + ' compared with the same days of ' + readableReportingMonth(previous) + '.');
  }
  const savings = calculateSavings(accounts, transactions, month);
  if (savings.savedThisMonth !== 0) messages.push(period + ': ' + formatMoney(Math.abs(savings.savedThisMonth)) + (savings.savedThisMonth > 0 ? ' transferred into savings, net.' : ' transferred out of savings, net.'));
  for (const goal of goals) {
    const progress = calculateGoalProgress(goal, accounts, transactions);
    messages.push(goal.name + ': ' + (progress.achieved ? 'target reached.' : Math.round(progress.progress * 100) + '% funded; ' + formatMoney(progress.remaining) + ' remaining at the current balance.'));
  }
  return messages.slice(0, 3);
}
