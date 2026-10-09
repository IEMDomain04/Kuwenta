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
