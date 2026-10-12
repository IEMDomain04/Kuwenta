import { philippineDateTime } from './dates';
import { budgetReport } from './budgets';
import type { Budget, Transaction } from './types';

const reminderMessages = [
  { title: 'Quick check-in', body: 'Anything you haven\u2019t recorded today?' },
  { title: 'A little catch-up', body: 'Any money activity to add to your records?' },
  { title: 'Before you forget', body: 'You can log anything you missed today.' },
] as const;

/** Six-hour waking-hour spacing; no overnight delivery or background polling. */
export function reminderPlan(now: Date, transactions: readonly Transaction[]) {
  const today = philippineDateTime(now).transactionDate;
  const base = Date.parse(today + 'T00:00:00+08:00');
  const activity = transactions.filter(t => t.type !== 'ADJUSTMENT').map(t => Date.parse(t.createdAt)).filter(time => time <= now.getTime());
  const result: { key: string; day: string; date: Date; title: string; body: string }[] = [];
  // At most 42 pending reminders, leaving room for alerts on iOS.
  for (let index = 0; index < 14; index++) {
    const day = philippineDateTime(new Date(base + index * 86400000)).transactionDate;
    for (const [slot, hour] of [8, 14, 20].entries()) {
      const timestamp = base + index * 86400000 + hour * 3600000;
      if (timestamp <= now.getTime()) continue;
      if (activity.some(time => time <= timestamp && timestamp - time < 6 * 3600000)) continue;
      result.push({ key: `${day}-${hour}`, day, date: new Date(timestamp), ...reminderMessages[slot] });
    }
  }
  return result;
}

export function budgetAlertPlan(budgets: readonly Budget[], transactions: readonly Transaction[], month: string) {
  return budgetReport(budgets, transactions, month).rows.filter(row => row.progress >= 0.8).map(row => ({
    key: month + ':' + row.category,
    level: row.spent > row.limitAmount ? 2 : 1,
    title: 'Budget update',
    body: row.spent > row.limitAmount
      ? 'Your recorded spending is over a budget limit.'
      : 'Your recorded spending is close to a budget limit.',
  }));
}
