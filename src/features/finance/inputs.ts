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

/** Group display digits without converting through floating point. */
export function formatEditableMoney(value: string, signed = false): string | null {
  const plain = value.replace(/,/g, '');
  if (!acceptsMoneyInput(plain, signed) || /[^0-9,.-]/.test(value)) return null;
  const [whole, fraction] = plain.split('.');
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return formatted + (fraction === undefined ? '' : '.' + fraction);
}

export function editMoneyInput(previous: string, next: string, selection: { start: number; end: number }, signed = false):
  { value: string; cursor: number } | null {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = previous.length;
  let nextEnd = next.length;
  while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
  let inserted = next.slice(start, nextEnd);
  const insertedLength = next.length - (previous.length - (selection.end - selection.start));
  if (insertedLength >= 0 && next === previous.slice(0, selection.start) + next.slice(selection.start, selection.start + insertedLength) + previous.slice(selection.end)) {
    start = selection.start; end = selection.end; nextEnd = start + insertedLength;
    inserted = next.slice(start, nextEnd);
  }
  // Validate pasted separators; single-character edits can temporarily disturb grouping.
  if (inserted.length > 1 && inserted.includes(',')
    && !/^-?\d{1,3}(?:,\d{3})+(?:\.\d{0,2})?$/.test(inserted)) return null;
  let cursor = nextEnd;
  if (!inserted && previous.slice(start, end) === ',') {
    const removeAt = selection.start > start ? start - 1 : start;
    if (removeAt >= 0 && /\d/.test(next[removeAt] ?? '')) {
      next = next.slice(0, removeAt) + next.slice(removeAt + 1);
      cursor = removeAt;
    }
  }
  const value = formatEditableMoney(next, signed);
  if (value === null) return null;
  const characters = next.slice(0, cursor).replace(/,/g, '').length;
  let position = 0;
  let seen = 0;
  while (position < value.length && seen < characters) {
    if (value[position] !== ',') seen++;
    position++;
  }
  if (value[position] === ',' && inserted) position++;
  return { value, cursor: position };
}
