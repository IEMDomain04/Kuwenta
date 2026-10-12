function assertCentavos(value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error('Amount must be safe integer centavos.');
}

/** Parses plain peso input exactly; no exponent, commas, or rounding. */
export function parseMoney(
  input: string,
  options: { allowNegative?: boolean; allowZero?: boolean } = {},
): number {
  const value = input.trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Enter a peso amount with at most two decimal places, without commas.');
  }
  const negative = value.startsWith('-');
  if (negative && !options.allowNegative) throw new Error('Amount must be positive.');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  // Build the integer as digits before converting, so large decimals cannot round into range.
  const digits = (whole + fraction.padEnd(2, '0')).replace(/^0+/, '') || '0';
  const maximum = String(Number.MAX_SAFE_INTEGER);
  if (digits.length > maximum.length || (digits.length === maximum.length && digits > maximum)) {
    throw new Error('Amount exceeds the supported range.');
  }
  const cents = Number(digits);
  if (cents === 0 && !options.allowZero) throw new Error('Amount must be greater than zero.');
  return cents === 0 ? 0 : negative ? -cents : cents;
}

/** Editable peso value, with exactly two decimal places. */
export function moneyInput(cents: number): string {
  assertCentavos(cents);
  const digits = String(Math.abs(cents)).padStart(3, '0');
  return `${cents < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function formatMoney(cents: number, trimWhole = false): string {
  const [whole, fraction] = moneyInput(cents).split('.');
  const negative = whole.startsWith('-');
  const grouped = whole.replace(/^-/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}₱${grouped}${trimWhole && fraction === '00' ? '' : '.' + fraction}`;
}
