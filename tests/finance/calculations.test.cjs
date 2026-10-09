const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateAccountSummary } = require('../../.expo/finance-tests/calculations.js');
const { cash, record } = require('./fixtures.cjs');
const income = record({ id: 'income-1', type: 'INCOME', amount: 50000, category: 'Salary' });

test('acceptance example excludes opening balance from monthly income', () => {
  assert.deepEqual(calculateAccountSummary(cash, [income, record()], '2026-10'), {
    balance: 138000, monthlyIncome: 50000, monthlyExpenses: 12000, hasNegativeBalance: false,
  });
  assert.deepEqual(calculateAccountSummary(cash, [], '2026-10'), {
    balance: 100000, monthlyIncome: 0, monthlyExpenses: 0, hasNegativeBalance: false,
  });
});
test('edits and removal recalculate without mutating original records', () => {
  const original = [income, record()];
  const edited = [income, record({ amount: 20000 })];
  assert.equal(calculateAccountSummary(cash, edited, '2026-10').balance, 130000);
  assert.equal(calculateAccountSummary(cash, [income], '2026-10').balance, 150000);
  assert.equal(calculateAccountSummary(cash, original, '2026-10').balance, 138000);
});
test('backdating changes reporting month, not overall account balance', () => {
  const rows = [income, record({ transactionDate: '2026-09-30', transactionTime: '23:59:59' })];
  assert.equal(calculateAccountSummary(cash, rows, '2026-10').monthlyExpenses, 0);
  assert.equal(calculateAccountSummary(cash, rows, '2026-09').monthlyExpenses, 12000);
  assert.equal(calculateAccountSummary(cash, rows, '2026-10').balance, 138000);
});
test('negative balances and centavos remain exact', () => {
  assert.equal(calculateAccountSummary({ ...cash, openingBalance: 0 }, [record()], '2026-10').hasNegativeBalance, true);
  const rows = [record({ id: 'one', type: 'INCOME', category: 'Other', amount: 10 }),
    record({ id: 'two', type: 'INCOME', category: 'Other', amount: 20 }), record({ amount: 29 })];
  assert.equal(calculateAccountSummary({ ...cash, openingBalance: 0 }, rows, '2026-10').balance, 1);
});
test('other accounts are excluded; archived account history is still calculated', () => {
  const rows = [record(), record({ id: 'other', accountId: 'bank', amount: 999 })];
  assert.equal(calculateAccountSummary({ ...cash, archived: true }, rows, '2026-10').balance, 88000);
});
test('invalid month, duplicate IDs, future types and overflow fail visibly', () => {
  assert.throws(() => calculateAccountSummary(cash, [], '2026-13'));
  assert.throws(() => calculateAccountSummary(cash, [record(), record()], '2026-10'));
  assert.throws(() => calculateAccountSummary(cash, [record({ type: 'TRANSFER' })], '2026-10'));
  assert.throws(() => calculateAccountSummary({ ...cash, openingBalance: Number.MAX_SAFE_INTEGER }, [income], '2026-10'));
  assert.throws(() => calculateAccountSummary({ ...cash, openingBalance: Number.MIN_SAFE_INTEGER }, [record()], '2026-10'));
  const largest = record({ id: 'largest', type: 'INCOME', category: 'Other', amount: Number.MAX_SAFE_INTEGER });
  assert.throws(() => calculateAccountSummary({ ...cash, openingBalance: -100 }, [largest, income], '2026-10'));
});
