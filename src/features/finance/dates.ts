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
