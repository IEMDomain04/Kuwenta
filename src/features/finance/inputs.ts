export function acceptsMoneyInput(value: string, signed = false): boolean {
  return (signed ? /^-?\d*(?:\.\d{0,2})?$/ : /^\d*(?:\.\d{0,2})?$/).test(value);
}
export function dateInput(value: string): string | null {
  if (!/^\d{0,8}$/.test(value) && !/^\d{0,4}(?:-\d{0,2})?(?:-\d{0,2})?$/.test(value)) return null;
  const digits = value.replace(/-/g, '');
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-');
}
export function timeInput(value: string): string | null {
  if (!/^\d{0,6}$/.test(value) && !/^\d{0,2}(?::\d{0,2})?(?::\d{0,2})?$/.test(value)) return null;
  const digits = value.replace(/:/g, '');
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)].filter(Boolean).join(':');
}
