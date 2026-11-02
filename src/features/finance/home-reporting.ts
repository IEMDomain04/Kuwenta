import { dashboardReport, type DashboardPeriod, type dashboardSpending } from './dashboard';
import { isValidMonth, philippineDateTime, readableReportingMonth, readableTransactionDate } from './dates';
import { adjacentMonth } from './reporting';

export type HomeReportingSelection = 'week' | 'last-week' | 'month' | 'last-month' | 'custom';
export const HOME_REPORTING_OPTIONS = [
  {value:'week',label:'This week'}, {value:'last-week',label:'Last week'},
  {value:'month',label:'This month'}, {value:'last-month',label:'Last month'},
  {value:'custom',label:'Choose month'},
] as const;

/** Resolve one Philippine calendar window without changing the app's active budgets or account totals. */
export function homeReportingPeriod(selection: HomeReportingSelection, customMonth: string, now: Date) {
  const today = philippineDateTime(now).transactionDate;
  let month = today.slice(0,7), anchor = now;
  const period: DashboardPeriod = selection === 'week' || selection === 'last-week' ? 'week' : 'month';
  if (selection === 'last-week') {
    const sunday = new Date(today+'T12:00:00Z');
    sunday.setUTCDate(sunday.getUTCDate() - (sunday.getUTCDay()+6)%7 - 1);
    const end = sunday.toISOString().slice(0,10);
    // The earliest supported date has no previous week; keep the selector in a valid range.
    anchor = new Date((end < '1900-01-01' ? '1900-01-01' : end)+'T23:59:59+08:00');
  } else if (selection === 'last-month') {
    month = month === '1900-01' ? month : adjacentMonth(month,-1);
  } else if (selection === 'custom') {
    if (!isValidMonth(customMonth)) throw new Error('Choose a valid reporting month.');
    month = customMonth;
  }
  const range = dashboardReport([],period,month,anchor);
  const label = selection === 'custom' ? readableReportingMonth(month) : HOME_REPORTING_OPTIONS.find(option=>option.value===selection)!.label;
  return {period,month,anchor,start:range.start,end:range.end,label,
    dates:readableTransactionDate(range.start)+(range.start===range.end?'':' - '+readableTransactionDate(range.end))};
}

/** Always six Monday-first calendar rows, with undated padding cells. */
export function spendingCalendarRows(days: ReturnType<typeof dashboardSpending>) {
  const offset = days.length ? (new Date(days[0].date+'T12:00:00Z').getUTCDay()+6)%7 : 0;
  return Array.from({length:6},(_,week) => Array.from({length:7},(_,weekday) => days[week*7+weekday-offset] ?? null));
}
