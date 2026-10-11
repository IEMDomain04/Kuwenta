const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moneyInsights } = require('../../.expo/finance-tests/insights.js');
const { cash, record } = require('./fixtures.cjs');
const now = new Date('2026-10-11T02:00:00Z');
test('empty records and opening money do not create spending insights', () => {
  assert.deepEqual(moneyInsights([cash], [], [], [], now), []);
});
test('budget warnings and categories use current transaction month and exact centavos', () => {
  const rows = [record(), record({ id: 'older', amount: 900000, transactionDate: '2026-09-09' })];
  const result = moneyInsights([cash], rows, [{ month: '2026-10', category: 'Food', limitAmount: 15000 }], [], now);
  assert.match(result[0], /80%/);
  assert.match(result[0], /30\.00 remaining/);
  assert.match(result[1], /120\.00 recorded/);
  assert.match(result[1], /October 2026/);
  assert.deepEqual(moneyInsights([cash], [], [], [], now), []);
});
test('transfer funding excludes income and expenses; goals use the current account balance', () => {
  const savings = { ...cash, id: 'save', name: 'Savings', openingBalance: 0, purpose: 'savings', includedInAvailable: false };
  const transfer = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 50000, sourcePurpose: 'spending', destinationPurpose: 'savings' });
  const result = moneyInsights([cash, savings], [transfer], [], [{ id: 'goal', name: 'Emergency', accountId: 'save', targetAmount: 100000, createdAt: '2026-10-09T06:35:00.000Z', updatedAt: '2026-10-09T06:35:00.000Z' }], now);
  assert.match(result[0], /transferred into savings/);
  assert.match(result[1], /50% funded/);
  assert.ok(result.every((message) => !message.includes('expense category')));
});
test('insights recalculate after edit or deletion without changing records', () => {
  const rows = Object.freeze([Object.freeze(record({ amount: 16000 }))]);
  const budgets = [{ month: '2026-10', category: 'Food', limitAmount: 15000 }];
  assert.match(moneyInsights([cash], rows, budgets, [], now)[0], /over budget/);
  assert.ok(!moneyInsights([cash], [record({ amount: 1000 })], budgets, [], now).some((text) => text.includes('over budget')));
  assert.deepEqual(moneyInsights([cash], [], budgets, [], now), []);
  assert.equal(rows[0].amount, 16000);
});

test('spending comparisons require both periods and match elapsed dates', () => {
  const rows = [record({ amount: 12000 }), record({ id: 'previous', amount: 10000, transactionDate: '2026-09-09' }), record({ id: 'later', amount: 900000, transactionDate: '2026-09-20' })];
  const messages = moneyInsights([cash], rows, [], [], now);
  assert.match(messages[1], /20\.00 higher/);
  assert.match(messages[1], /days 1-11/);
  assert.equal(moneyInsights([cash], [rows[0]], [], [], now).length, 1);
});
