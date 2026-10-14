import { isValidDate, isValidMonth, readableReportingMonth } from './dates';
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';
export function budgetPeriodKey(period: BudgetPeriod, date: string): string {
  if (!isValidDate(date)) throw new Error('Choose a valid budget date.');
  if (period === 'monthly') return date.slice(0, 7);
  if (period === 'daily') return 'daily:' + date;
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  const monday = value.toISOString().slice(0, 10);
  if (!isValidDate(monday)) throw new Error('Choose a later budget date.');
  return 'weekly:' + monday;
}
export function budgetPeriodRange(key: string): { period: BudgetPeriod; start: string; end: string } {
  if (isValidMonth(key)) {
    const value = new Date(key + '-01T00:00:00Z'); value.setUTCMonth(value.getUTCMonth() + 1); value.setUTCDate(0);
    return { period: 'monthly', start: key + '-01', end: value.toISOString().slice(0, 10) };
  }
  const parts = key.split(':');
  const [period, date] = parts;
  if (parts.length !== 2 || !isValidDate(date) || (period !== 'daily' && period !== 'weekly')) throw new Error('Choose a valid budget period.');
  if (period === 'weekly' && budgetPeriodKey('weekly', date) !== key) throw new Error('Weekly budgets start on Monday.');
  const end = new Date(date + 'T00:00:00Z'); if (period === 'weekly') end.setUTCDate(end.getUTCDate() + 6);
  const endDate = end.toISOString().slice(0, 10);
  if (!isValidDate(endDate)) throw new Error('Choose an earlier budget date.');
  return { period, start: date, end: endDate };
}
export function isBudgetPeriodKey(key: string): boolean { try { budgetPeriodRange(key); return true; } catch { return false; } }
export function budgetPeriodLabel(key: string): string {
  const { period, start, end } = budgetPeriodRange(key);
  if (period === 'monthly') return readableReportingMonth(key);
  const label = (date: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
  return period === 'daily' ? label(start) : label(start) + ' - ' + label(end);
}
