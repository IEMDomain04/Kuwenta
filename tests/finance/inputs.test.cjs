const { test } = require('node:test');
const assert = require('node:assert/strict');
const { acceptsMoneyInput, dateInput, timeInput } = require('../../.expo/finance-tests/inputs.js');
test('money input rejects mixed paste and extra precision while allowing partial editing', () => {
  for (const value of ['', '0', '.', '120.', '120.50']) assert.equal(acceptsMoneyInput(value), true);
  for (const value of ['12abc34', '1,000', '1.234', '1..2', '1e3', '-12', '+12', ' 12 ']) assert.equal(acceptsMoneyInput(value), false);
  assert.equal(acceptsMoneyInput('-12.50', true), true);
  assert.equal(acceptsMoneyInput('-', true), true);
  assert.equal(acceptsMoneyInput('12-3', true), false);
});
test('date input formats digits and rejects mixed pasted text', () => {
  assert.equal(dateInput('20261009'), '2026-10-09');
  assert.equal(dateInput('2026-10-09'), '2026-10-09');
  assert.equal(dateInput('20261'), '2026-1');
  assert.equal(dateInput(''), '');
  for (const value of ['2026abc1009', '2026/10/09', '202610091', '2026-10-009']) assert.equal(dateInput(value), null);
});
test('time input formats digits and rejects letters without stripping them', () => {
  assert.equal(timeInput('143500'), '14:35:00');
  assert.equal(timeInput('14:35:00'), '14:35:00');
  assert.equal(timeInput('143'), '14:3');
  assert.equal(timeInput(''), '');
  for (const value of ['14abc3500', '14:35 PM', '1435000', '14.35.00']) assert.equal(timeInput(value), null);
});

test('live money formatting preserves partial decimals and exact digit strings', () => {
  const { formatEditableMoney } = require('../../.expo/finance-tests/inputs.js');
  for (const [value, expected] of [
    ['1000', '1,000'], ['12345.67', '12,345.67'], ['1000.', '1,000.'],
    ['1000.5', '1,000.5'], ['', ''], ['.', '.'], ['-1000.50', '-1,000.50'],
    ['90071992547409.91', '90,071,992,547,409.91'],
  ]) assert.equal(formatEditableMoney(value, true), expected);
  for (const value of ['1a00', '1.234', '1..2', '1e3', '₱100']) assert.equal(formatEditableMoney(value), null);
  assert.equal(formatEditableMoney('-1'), null);
});

test('money edits preserve caret position across grouping, paste, range replacement and deletion', () => {
  const { editMoneyInput } = require('../../.expo/finance-tests/inputs.js');
  assert.deepEqual(editMoneyInput('', '1000', { start: 0, end: 0 }), { value: '1,000', cursor: 5 });
  assert.deepEqual(editMoneyInput('1,000', '1,0000', { start: 5, end: 5 }), { value: '10,000', cursor: 6 });
  assert.deepEqual(editMoneyInput('1,000', '19,000', { start: 1, end: 1 }), { value: '19,000', cursor: 3 });
  assert.deepEqual(editMoneyInput('1,000', '1000', { start: 2, end: 2 }), { value: '000', cursor: 0 });
  assert.deepEqual(editMoneyInput('1,000', '1000', { start: 1, end: 1 }), { value: '100', cursor: 1 });
  assert.deepEqual(editMoneyInput('12,345', '900', { start: 0, end: 6 }), { value: '900', cursor: 3 });
  assert.equal(editMoneyInput('', '1,2', { start: 0, end: 0 }), null);
  assert.equal(editMoneyInput('', '12abc', { start: 0, end: 0 }), null);
  assert.deepEqual(editMoneyInput('', '1,000.50', { start: 0, end: 0 }), { value: '1,000.50', cursor: 8 });
});

test('formatted amounts still parse as exact centavos after removing display separators', () => {
  const { formatEditableMoney } = require('../../.expo/finance-tests/inputs.js');
  const { parseMoney } = require('../../.expo/finance-tests/money.js');
  assert.equal(parseMoney(formatEditableMoney('12345.67').replace(/,/g, '')), 1234567);
  assert.equal(parseMoney(formatEditableMoney('-1000.50', true).replace(/,/g, ''), { allowNegative: true }), -100050);
  assert.equal(parseMoney(formatEditableMoney('90071992547409.91').replace(/,/g, '')), Number.MAX_SAFE_INTEGER);
});
