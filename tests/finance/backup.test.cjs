const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serializeBackup, parseBackup, previewBackup } = require('../../.expo/finance-tests/backup.js');
const { calculateAccountSummary } = require('../../.expo/finance-tests/calculations.js');
const { cash, record } = require('./fixtures.cjs');
const exportedAt = '2026-10-09T06:35:00.000Z';
function payload() {
  return JSON.parse(serializeBackup(cash, [record()], exportedAt));
}
function reject(change) {
  const value = payload();
  change(value);
  assert.throws(() => parseBackup(JSON.stringify(value)));
}

test('backup round trip preserves money, Philippine time, notes, IDs and audit timestamps', () => {
  const rows = [
    record({ id: 'income', type: 'INCOME', category: 'Salary', amount: 50000 }),
    record({ notes: 'Lunch ₱120', updatedAt: '2026-10-09T07:00:00.000Z' }),
  ];
  const restored = parseBackup(serializeBackup(cash, rows, exportedAt));
  assert.deepEqual(restored.accounts, [cash]);
  assert.deepEqual(restored.transactions, rows);
  assert.deepEqual(calculateAccountSummary(restored.accounts[0], restored.transactions, '2026-10'), {
    balance: 138000, monthlyIncome: 50000, monthlyExpenses: 12000, hasNegativeBalance: false,
  });
  assert.deepEqual(previewBackup(restored), {
    exportedAt, transactionCount: 2, incomeCount: 1, expenseCount: 1, cashBalance: 138000,
  });
});

test('empty backups and negative balances are valid; archived history remains intact', () => {
  const empty = parseBackup(serializeBackup({ ...cash, openingBalance: 0 }, [], exportedAt));
  assert.equal(previewBackup(empty).cashBalance, 0);
  const archived = { ...cash, openingBalance: -100, archived: true };
  assert.deepEqual(parseBackup(serializeBackup(archived, [record()], exportedAt)).accounts, [archived]);
});

test('backdated records retain their reporting month after round trip', () => {
  const rows = [record({ transactionDate: '2026-09-30', transactionTime: '23:59:59' })];
  const restored = parseBackup(serializeBackup(cash, rows, exportedAt));
  assert.equal(calculateAccountSummary(cash, restored.transactions, '2026-09').monthlyExpenses, 12000);
  assert.equal(calculateAccountSummary(cash, restored.transactions, '2026-10').monthlyExpenses, 0);
});

test('malformed JSON, metadata, unknown versions and unsupported fields are rejected', () => {
  for (const value of ['{', 'null', '[]', '1']) assert.throws(() => parseBackup(value));
  reject((v) => { v.version = 2; });
  reject((v) => { v.format = 'other'; });
  reject((v) => { v.currency = 'USD'; });
  reject((v) => { v.timezone = 'UTC'; });
  reject((v) => { v.exportedAt = 'today'; });
  reject((v) => { v.cachedBalance = 100; });
});

test('invalid accounts and account references are rejected', () => {
  for (const accounts of [[], null, [cash, cash], [null]]) reject((v) => { v.accounts = accounts; });
  reject((v) => { v.accounts[0].id = 1; });
  reject((v) => { v.accounts[0].openingBalance = 1.5; });
  reject((v) => { v.accounts[0].archived = 'false'; });
  reject((v) => { v.transactions[0].accountId = 'missing'; });
});

test('duplicate IDs, unsupported types and invalid transaction fields are rejected', () => {
  reject((v) => { v.transactions.push({ ...v.transactions[0] }); });
  for (const patch of [
    { type: 'TRANSFER' }, { type: 'ADJUSTMENT' }, { id: 1 }, { amount: 0 },
    { amount: -1 }, { amount: 0.1 }, { amount: Number.MAX_SAFE_INTEGER + 1 },
    { amount: '12000' }, { transactionDate: '2026-02-30' },
    { transactionTime: '24:00:00' }, { category: 'Invalid' }, { notes: null },
    { createdAt: 'today' }, { updatedAt: '2026-10-08T06:35:00.000Z' },
    { destinationAccountId: 'other' },
  ]) reject((v) => { Object.assign(v.transactions[0], patch); });
  reject((v) => { delete v.transactions[0].transactionTime; });
  reject((v) => { v.transactions = null; });
  reject((v) => { v.transactions = [null]; });
});

test('unsafe balances and monthly totals are rejected before restore', () => {
  assert.throws(() => serializeBackup({ ...cash, openingBalance: Number.MAX_SAFE_INTEGER }, [
    record({ type: 'INCOME', category: 'Salary', amount: 1 }),
  ], exportedAt));
  const rows = [
    record({ id: 'a', type: 'INCOME', category: 'Salary', amount: Number.MAX_SAFE_INTEGER }),
    record({ id: 'b', amount: Number.MAX_SAFE_INTEGER }),
    record({ id: 'c', type: 'INCOME', category: 'Salary', amount: 1 }),
  ];
  assert.throws(() => serializeBackup({ ...cash, openingBalance: 0 }, rows, exportedAt));
});

test('serialization and rejected parsing do not mutate source records', () => {
  const account = Object.freeze({ ...cash });
  const rows = Object.freeze([Object.freeze(record())]);
  const before = JSON.stringify({ account, rows });
  serializeBackup(account, rows, exportedAt);
  reject((v) => { v.transactions[0].amount = -1; });
  assert.equal(JSON.stringify({ account, rows }), before);
});

test('SQLite records with unset future fields serialize without enabling future operations', () => {
  const row = record({ notes: undefined, destinationAccountId: undefined, adjustmentDirection: undefined });
  const restored = parseBackup(serializeBackup(cash, [row], exportedAt));
  assert.deepEqual(restored.transactions, [record()]);
});
