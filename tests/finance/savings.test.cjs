const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cash, record } = require('./fixtures.cjs');
const { calculateSavings, calculateGoalProgress } = require('../../.expo/finance-tests/calculations.js');
const { validateGoal, validateManualRecord } = require('../../.expo/finance-tests/validation.js');
const { serializeBackup, parseBackup, previewBackup } = require('../../.expo/finance-tests/backup.js');
const savings = { ...cash, id: 'save', name: 'Savings', openingBalance: 10000, purpose: 'savings', includedInAvailable: false };
const second = { ...savings, id: 'second', name: 'Second', openingBalance: 0 };
const goal = { id: 'goal', name: 'Emergency fund', accountId: 'save', targetAmount: 50000, targetDate: '2027-01-01', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
function transfer(overrides = {}) { return record({ type: 'TRANSFER', category: 'Transfer', accountId: 'cash', destinationAccountId: 'save', amount: 20000, sourcePurpose: 'spending', destinationPurpose: 'savings', ...overrides }); }

test('savings separates current balances from selected-month net transfers and income', () => {
  const rows = [
    record({ id: 'salary', type: 'INCOME', category: 'Salary', amount: 100000 }),
    transfer({ id: 'fund' }),
    transfer({ id: 'return', accountId: 'save', destinationAccountId: 'cash', sourcePurpose: 'savings', destinationPurpose: 'spending', amount: 5000 }),
    transfer({ id: 'between', accountId: 'save', destinationAccountId: 'second', sourcePurpose: 'savings', amount: 1000 }),
    transfer({ id: 'old', transactionDate: '2026-09-30', amount: 1000 }),
    record({ id: 'adjust', accountId: 'save', type: 'ADJUSTMENT', category: 'Balance adjustment', amount: 10, adjustmentDirection: 'increase' }),
  ];
  assert.deepEqual(calculateSavings([cash, savings, second], rows, '2026-10'), { balance: 26010, savedThisMonth: 15000, savingsRate: 15, usesLegacyPurposes: false });
  assert.equal(calculateSavings([cash, savings, second], rows, '2026-09').savedThisMonth, 1000);
  assert.equal(calculateSavings([cash, savings, second], rows, '2026-09').balance, 26010);
  const changed = { ...cash, purpose: 'savings' };
  assert.equal(calculateSavings([changed, savings, second], rows, '2026-10').savedThisMonth, 15000);
});

test('negative savings rates and zero-income reports remain meaningful; legacy transfers are flagged', () => {
  const row = transfer({ accountId: 'save', destinationAccountId: 'cash', sourcePurpose: 'savings', destinationPurpose: 'spending', amount: 20000 });
  assert.equal(calculateSavings([cash, savings], [row], '2026-10').savingsRate, null);
  const result = calculateSavings([cash, savings], [row, record({ id: 'income', type: 'INCOME', category: 'Salary', amount: 10000 })], '2026-10');
  assert.equal(result.savingsRate, -200);
  assert.equal(result.balance, -10000);
  const legacy = transfer({ sourcePurpose: undefined, destinationPurpose: undefined });
  assert.equal(calculateSavings([cash, savings], [legacy], '2026-10').usesLegacyPurposes, true);
  assert.throws(() => validateManualRecord(transfer({ destinationPurpose: undefined })));
  assert.throws(() => validateManualRecord(record({ sourcePurpose: 'spending', destinationPurpose: 'savings' })));
});

test('goal progress derives from balance and handles withdrawals, negatives and overfunding', () => {
  assert.deepEqual(calculateGoalProgress(goal, [cash, savings], [transfer()]), { balance: 30000, remaining: 20000, progress: 0.6, achieved: false });
  assert.equal(calculateGoalProgress(goal, [cash, { ...savings, openingBalance: -100 }], []).progress, 0);
  assert.equal(calculateGoalProgress(goal, [cash, { ...savings, openingBalance: -100 }], []).remaining, 50100);
  assert.deepEqual(calculateGoalProgress(goal, [cash, { ...savings, openingBalance: 60000 }], []), { balance: 60000, remaining: 0, progress: 1, achieved: true });
  for(const patch of [{ name: '' }, { targetAmount: 0 }, { targetAmount: 1.5 }, { targetDate: '2026-02-30' }, { accountId: 'cash' }, { updatedAt: 'invalid' }]) assert.throws(() => validateGoal({ ...goal, ...patch }, [cash, savings]));
});

test('goals and purpose snapshots round trip; malformed or duplicated goals reject before restore', () => {
  const payload = JSON.parse(serializeBackup([cash, savings], [transfer()], '2026-10-10T00:00:00.000Z', [goal]));
  assert.equal(payload.version, 5);
  assert.deepEqual(parseBackup(JSON.stringify(payload)).goals, [goal]);
  assert.equal(previewBackup(parseBackup(JSON.stringify(payload))).goalCount, 1);
  for(const goals of [[goal, goal], [{ ...goal, targetAmount: -1 }], [{ ...goal, accountId: 'cash' }], [{ ...goal, unknown: true }]]) assert.throws(() => parseBackup(JSON.stringify({ ...payload, goals })));
  assert.throws(() => parseBackup(JSON.stringify({ ...payload, version: 4 })));
  const legacy = { ...payload, version: 4, goals: undefined, transactions: [transfer({ sourcePurpose: undefined, destinationPurpose: undefined })] };
  assert.equal(parseBackup(JSON.stringify(legacy)).goals.length, 0);
});
