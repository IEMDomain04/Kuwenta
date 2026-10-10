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

test('current money includes spending openings and savings without counting either as income', () => {
  const { calculateCurrentMoney, calculateFinanceSummary } = require('../../.expo/finance-tests/calculations.js');
  const accounts = [
    { ...cash, openingBalance: 0 },
    { ...cash, id: 'bank', name: 'Bank', openingBalance: 1000000 },
    { ...cash, id: 'savings', name: 'Savings', openingBalance: 500000, purpose: 'savings', includedInAvailable: false },
  ];
  assert.deepEqual(calculateCurrentMoney(accounts, []), { totalMoney: 1500000, availableMoney: 1000000, hasNegativeAccount: false });
  assert.equal(calculateFinanceSummary(accounts, [], '2026-10').monthlyIncome, 0);
  assert.deepEqual(calculateCurrentMoney(accounts.map((account) => ({ ...account, includedInAvailable: false })), []),
    { totalMoney: 1500000, availableMoney: 0, hasNegativeAccount: false });
});
test('current money includes archived balances and recalculates edits, deletions and inclusion flags', () => {
  const { calculateCurrentMoney } = require('../../.expo/finance-tests/calculations.js');
  const accounts = [{ ...cash, openingBalance: 0 }, { ...cash, id: 'bank', name: 'Bank', archived: true, openingBalance: 1000000 }];
  const expense = record({ accountId: 'bank', transactionDate: '2026-09-30', amount: 12345 });
  assert.equal(calculateCurrentMoney(accounts, [expense]).availableMoney, 987655);
  assert.equal(calculateCurrentMoney(accounts, [{ ...expense, amount: 20000 }]).totalMoney, 980000);
  assert.equal(calculateCurrentMoney(accounts, []).totalMoney, 1000000);
  assert.equal(calculateCurrentMoney(accounts.map((account) => ({ ...account, includedInAvailable: false })), [expense]).availableMoney, 0);
  const negative = calculateCurrentMoney(accounts, [expense, record({ id: 'cash-negative', amount: 1 })]);
  assert.equal(negative.hasNegativeAccount, true);
  assert.equal(negative.totalMoney, 987654);
});
test('current money rejects unsafe aggregate sums and unknown or duplicate account records', () => {
  const { calculateCurrentMoney } = require('../../.expo/finance-tests/calculations.js');
  assert.throws(() => calculateCurrentMoney([{ ...cash, openingBalance: Number.MAX_SAFE_INTEGER }, { ...cash, id: 'bank', openingBalance: 1 }], []), /supported range/);
  assert.throws(() => calculateCurrentMoney([{ ...cash, openingBalance: Number.MIN_SAFE_INTEGER }, { ...cash, id: 'bank', openingBalance: -1 }], []), /supported range/);
  assert.throws(() => calculateCurrentMoney([cash], [record({ accountId: 'missing' })]), /unknown account/);
  assert.throws(() => calculateCurrentMoney([cash, cash], []), /Duplicate account/);
});