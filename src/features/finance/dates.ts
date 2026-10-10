const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Philippine time is fixed UTC+8. Do not use the device's local date/time. */
export function philippineDateTime(now: Date = new Date()): {
  transactionDate: string;
  transactionTime: string;
} {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid timestamp.');
  const shifted = new Date(now.getTime() + PH_OFFSET_MS);
  if (!Number.isFinite(shifted.getTime())) throw new Error('Timestamp is outside the supported range.');
  const iso = shifted.toISOString();
  const transactionDate = iso.slice(0, 10);
  if (!isValidDate(transactionDate)) throw new Error('Transaction date must be between 1900 and 9999.');
  return { transactionDate, transactionTime: iso.slice(11, 19) };
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function isValidTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
}

export function isValidMonth(value: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value) && isValidDate(`${value}-01`);
}

export function isUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

/** Picker values represent Philippine wall time, never device-local time. */
export function transactionPickerValue(date: string, time: string): Date {
  if (!isValidDate(date) || !isValidTime(time)) throw new Error('Invalid transaction date/time.');
  return new Date(date + 'T' + time + '+08:00');
}
export function pickedTransactionTime(value: Date, previous: string): string {
  if (!isValidTime(previous)) throw new Error('Invalid transaction time.');
  const minutes = philippineDateTime(value).transactionTime.slice(0, 5);
  return minutes === previous.slice(0, 5) ? previous : minutes + ':00';
}
export function readableTransactionDate(date: string): string {
  if (!isValidDate(date)) throw new Error('Invalid transaction date.');
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' })
    .format(transactionPickerValue(date, '12:00:00'));
}

/** Readable display of stored Philippine wall time; never convert through device timezone. */
export function formatTransactionDateTime(date: string, time: string): string {
  if (!isValidDate(date) || !isValidTime(time)) throw new Error('Invalid transaction date/time.');
  const [year, month, day] = date.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hour = Number(time.slice(0, 2));
  return names[month - 1] + ' ' + day + ', ' + year + ' · ' + (hour % 12 || 12) + ':' + time.slice(3, 5) + (hour < 12 ? ' AM' : ' PM');
}
export function readableReportingMonth(month: string): string {
  if (!isValidMonth(month)) throw new Error('Invalid reporting month.');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return names[Number(month.slice(5)) - 1] + ' ' + month.slice(0, 4);
}
/** Day headings compare Philippine calendar dates, including month/year boundaries. */
export function transactionDayHeading(date: string, now: Date = new Date()): string {
  if (!isValidDate(date)) throw new Error('Invalid transaction date.');
  const today = philippineDateTime(now).transactionDate;
  const previous = new Date(today + 'T12:00:00Z');
  previous.setUTCDate(previous.getUTCDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  const day = new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
  const label = date === today ? 'Today' : date === yesterday ? 'Yesterday' : day;
  return label + ' · ' + formatTransactionDateTime(date, '12:00:00').split(' · ')[0];
}