const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adjacentMonth, filterTransactions } = require('../../.expo/finance-tests/reporting.js');
const { calculateAccountSummary } = require('../../.expo/finance-tests/calculations.js');
const { philippineDateTime } = require('../../.expo/finance-tests/dates.js');
const { cash, record } = require('./fixtures.cjs');
test('month navigation crosses year boundaries and rejects invalid months', () => {
  assert.equal(adjacentMonth('2026-01', -1), '2025-12');
  assert.equal(adjacentMonth('2026-12', 1), '2027-01');
  assert.throws(() => adjacentMonth('1900-01', -1));
  assert.throws(() => adjacentMonth('9999-12', 1));
  assert.throws(() => adjacentMonth('2026-13', 1));
});
test('month/type filtering preserves history order and the original array', () => {
  const rows = [record({ id: 'income', type: 'INCOME', category: 'Salary', amount: 50000 }), record({ id: 'expense' }), record({ id: 'previous', transactionDate: '2026-09-30' })];
  assert.deepEqual(filterTransactions(rows, '2026-10').map((row) => row.id), ['income', 'expense']);
  assert.deepEqual(filterTransactions(rows, '2026-10', 'INCOME').map((row) => row.id), ['income']);
  assert.deepEqual(filterTransactions(rows, '2026-10', 'EXPENSE').map((row) => row.id), ['expense']);
  assert.deepEqual(filterTransactions(rows, '2025-12'), []);
  assert.equal(rows.length, 3);
});
test('changing reports and transaction dates changes monthly totals but not balance', () => {
  const rows = [record({ id: 'income', type: 'INCOME', category: 'Salary', amount: 50000 }), record({ id: 'expense', transactionDate: '2026-09-30' })];
  assert.equal(calculateAccountSummary(cash, rows, '2026-10').balance, 138000);
  assert.equal(calculateAccountSummary(cash, rows, '2026-09').balance, 138000);
  assert.equal(calculateAccountSummary(cash, rows, '2026-10').monthlyExpenses, 0);
  assert.equal(calculateAccountSummary(cash, rows, '2026-09').monthlyExpenses, 12000);
  const edited = rows.map((row) => row.id === 'expense' ? { ...row, transactionDate: '2026-10-01' } : row);
  assert.equal(filterTransactions(edited, '2026-09').length, 0);
  assert.equal(calculateAccountSummary(cash, edited, '2026-10').monthlyExpenses, 12000);
  assert.equal(calculateAccountSummary(cash, rows, '2026-10').monthlyIncome, 50000);
});
test('new entry defaults stay in Philippine today, independent of historical selection', () => {
  const historicalMonth = '2025-12';
  const defaults = philippineDateTime(new Date('2026-09-30T16:00:00Z'));
  assert.equal(defaults.transactionDate, '2026-10-01');
  assert.notEqual(defaults.transactionDate.slice(0, 7), historicalMonth);
});

const { spendingByCategory } = require('../../.expo/finance-tests/reporting.js');
test('category breakdown matches monthly expenses and excludes income and other months', () => {
  const rows = [
    record({ id: 'a', amount: 12000 }),
    record({ id: 'b', amount: 2300 }),
    record({ id: 'c', category: 'Bills', amount: 50000 }),
    record({ id: 'd', type: 'INCOME', category: 'Salary', amount: 90000 }),
    record({ id: 'e', transactionDate: '2026-09-30', amount: 4000 }),
  ];
  const categories = spendingByCategory(rows, '2026-10');
  assert.deepEqual(categories, [{ category: 'Bills', amount: 50000 }, { category: 'Food', amount: 14300 }]);
  assert.equal(categories.reduce((sum, row) => sum + row.amount, 0), calculateAccountSummary(cash, rows, '2026-10').monthlyExpenses);
  const edited = rows.map(row => row.id === 'a' ? { ...row, amount: 12001 } : row);
  assert.equal(spendingByCategory(edited, '2026-10')[1].amount, 14301);
  assert.equal(spendingByCategory(rows.filter(row => row.id !== 'c'), '2026-10')[0].category, 'Food');
  assert.deepEqual(spendingByCategory(rows, '2025-01'), []);
  assert.equal(rows[0].amount, 12000);
});
test('category breakdown rejects invalid months, invalid amounts and unsafe totals', () => {
  assert.throws(() => spendingByCategory([], '2026-13'));
  assert.throws(() => spendingByCategory([record({ amount: 0.1 })], '2026-10'));
  assert.throws(() => spendingByCategory([record({ amount: -1 })], '2026-10'));
  assert.throws(() => spendingByCategory([record({ amount: Number.MAX_SAFE_INTEGER }), record({ id: 'b', category: 'Bills', amount: 1 })], '2026-10'));
});