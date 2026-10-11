import { philippineDateTime } from './dates';
import { budgetReport } from './budgets';
import type { Budget, Transaction } from './types';

export function reminderPlan(now: Date, start: number, end: number, transactions: readonly Transaction[], random: (day: string) => number) {
  const today = philippineDateTime(now).transactionDate;
  const logged = new Set(transactions.filter(t => t.type !== 'ADJUSTMENT').map(t => philippineDateTime(new Date(t.createdAt)).transactionDate));
  const base = Date.parse(today + 'T00:00:00+08:00');
  const result: { day: string; date: Date }[] = [];
  for (let index = 0; index < 30; index++) {
    const day = philippineDateTime(new Date(base + index * 86400000)).transactionDate;
    if (logged.has(day)) continue;
    const minute = start * 60 + Math.floor(Math.max(0, Math.min(0.999999, random(day))) * (end - start) * 60);
    const date = new Date(base + index * 86400000 + minute * 60000);
    if (date.getTime() > now.getTime()) result.push({ day, date });
  }
  return result;
}

export function budgetAlertPlan(budgets: readonly Budget[], transactions: readonly Transaction[], month: string) {
  return budgetReport(budgets, transactions, month).rows.filter(row => row.progress >= 0.8).map(row => ({
    key: month + ':' + row.category,
    level: row.spent > row.limitAmount ? 2 : 1,
    title: row.spent > row.limitAmount ? 'Budget exceeded' : 'Budget check-in',
    body: row.spent > row.limitAmount
      ? 'Recorded spending has exceeded a monthly budget. Open Plans to review it.'
      : 'You have used at least 80% of a monthly budget. Open Plans to check what remains.',
  }));
}
