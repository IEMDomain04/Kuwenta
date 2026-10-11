import { isValidMonth, philippineDateTime } from './dates';
import type { Transaction } from './types';

export type DashboardPeriod = 'day' | 'week' | 'month';

/** Reports use Philippine calendar dates and exclude transfers and adjustments. */
export function dashboardReport(transactions: readonly Transaction[], period: DashboardPeriod, month: string, now = new Date()) {
  if (!isValidMonth(month)) throw new Error('Invalid reporting month.');
  const today = philippineDateTime(now).transactionDate;
  let start = today;
  let end = today;
  if (period === 'week') {
    const monday = new Date(today + 'T12:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    start = monday.toISOString().slice(0, 10);
    if (start < '1900-01-01') start = '1900-01-01';
  } else if (period === 'month') {
    start = month + '-01';
    const [year, number] = month.split('-').map(Number);
    end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  } else if (period !== 'day') throw new Error('Invalid reporting period.');
  const records = transactions.filter((record) => record.transactionDate >= start && record.transactionDate <= end && (record.type === 'INCOME' || record.type === 'EXPENSE'));
  function totals(from: string, to: string) {
    let income = 0;
    let expenses = 0;
    for (const record of records) {
      if (record.transactionDate < from || record.transactionDate > to) continue;
      if (!Number.isSafeInteger(record.amount) || record.amount <= 0) throw new Error('Invalid transaction amount.');
      if (record.type === 'INCOME') income += record.amount;
      else expenses += record.amount;
      if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expenses)) throw new Error('Report exceeds the supported monetary range.');
    }
    return { income, expenses };
  }
  const buckets = [];
  let cursor = new Date(start + 'T12:00:00Z');
  while (cursor.toISOString().slice(0, 10) <= end) {
    const from = cursor.toISOString().slice(0, 10);
    const first = cursor.getUTCDate();
    cursor.setUTCDate(period === 'month' ? Math.min(first + 6, Number(end.slice(8))) : first);
    const to = cursor.toISOString().slice(0, 10) > end ? end : cursor.toISOString().slice(0, 10);
    const label = period === 'month' ? first + '-' + Number(to.slice(8)) : new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(from + 'T12:00:00Z'));
    buckets.push({ label, start: from, end: to, ...totals(from, to) });
    if (to === end) break;
    cursor = new Date(to + 'T12:00:00Z');
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const result = totals(start, end);
  return { start, end, ...result, buckets, expenseIncomeRate: result.income === 0 ? null : result.expenses / result.income * 100 };
}

export function dashboardGreeting(name: string, now = new Date()): string {
  const hour = Number(philippineDateTime(now).transactionTime.slice(0, 2));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return greeting + (name.trim() ? ', ' + name.trim() : '') + '!';
}

/** Daily expense series: Day provides seven-day context; Week includes empty future days. */
export function dashboardSpending(transactions: readonly Transaction[], period: DashboardPeriod, month: string, now = new Date()) {
  const report = dashboardReport(transactions, period, month, now);
  const today = philippineDateTime(now).transactionDate;
  const startDate = new Date(report.start + 'T12:00:00Z');
  const endDate = new Date(report.end + 'T12:00:00Z');
  if (period === 'day') startDate.setUTCDate(startDate.getUTCDate() - 6);
  if (period === 'week') endDate.setTime(startDate.getTime() + 6 * 86400000);
  const start = Math.max(new Date('1900-01-01T12:00:00Z').getTime(), startDate.getTime());
  const end = Math.min(new Date('9999-12-31T12:00:00Z').getTime(), endDate.getTime());
  const amounts = new Map<string, number>();
  for (const record of transactions) {
    if (record.type !== 'EXPENSE') continue;
    const stamp = new Date(record.transactionDate + 'T12:00:00Z').getTime();
    if (stamp < start || stamp > end || period !== 'month' && record.transactionDate > today) continue;
    if (!Number.isSafeInteger(record.amount) || record.amount <= 0) throw new Error('Invalid transaction amount.');
    const amount = (amounts.get(record.transactionDate) ?? 0) + record.amount;
    if (!Number.isSafeInteger(amount)) throw new Error('Daily spending exceeds the supported monetary range.');
    amounts.set(record.transactionDate, amount);
  }
  const labels = ['Sun', 'M', 'T', 'W', 'TH', 'F', 'S'];
  const days = [];
  for (let stamp = start; stamp <= end; stamp += 86400000) {
    const date = new Date(stamp);
    const key = date.toISOString().slice(0, 10);
    days.push({ date: key, label: period === 'month' ? String(date.getUTCDate()) : labels[date.getUTCDay()], expenses: amounts.get(key) ?? 0, isToday: key === today });
  }
  return days;
}
