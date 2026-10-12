const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMoney, moneyInput, formatMoney } = require('../../.expo/finance-tests/money.js');

test('peso decimals become exact integer centavos', () => {
  assert.equal(parseMoney('120.50'), 12050);
  assert.equal(parseMoney('0.10') + parseMoney('0.20'), 30);
  assert.equal(parseMoney(' 001.2 '), 120);
  assert.equal(parseMoney('0.01'), 1);
});
test('invalid and imprecise inputs are rejected', () => {
  for (const value of ['', '0', '-1', '1.001', 'NaN', 'Infinity', '1e3', '1,000', 'PHP 1', '.50', '1.']) {
    assert.throws(() => parseMoney(value));
  }
});
test('opening balance can explicitly allow zero and negative money', () => {
  assert.equal(parseMoney('0', { allowZero: true }), 0);
  assert.equal(parseMoney('-12.50', { allowNegative: true }), -1250);
});
test('large decimals are validated before number conversion', () => {
  assert.equal(parseMoney('90071992547409.91'), Number.MAX_SAFE_INTEGER);
  assert.throws(() => parseMoney('90071992547409.92'));
  assert.throws(() => parseMoney('999999999999999999999999'));
  assert.equal(moneyInput(Number.MAX_SAFE_INTEGER), '90071992547409.91');
});
test('formats exact cents including negatives', () => {
  assert.equal(formatMoney(138000), '₱1,380.00');
  assert.equal(formatMoney(-1), '-₱0.01');
  assert.equal(moneyInput(0), '0.00');
  assert.throws(() => formatMoney(1.5));
});

test('notice amounts omit zero decimals without losing fractional centavos', () => {
  assert.equal(formatMoney(10000, true), '₱100');
  assert.equal(formatMoney(10050, true), '₱100.50');
  assert.equal(formatMoney(-10000, true), '-₱100');
  assert.equal(formatMoney(0, true), '₱0');
});
