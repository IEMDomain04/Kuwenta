const { test } = require('node:test');
const assert = require('node:assert/strict');
const { budgetReport, validateBudget } = require('../../.expo/finance-tests/budgets.js');
const { serializeBackup, parseBackup, previewBackup } = require('../../.expo/finance-tests/backup.js');
const { cash, record } = require('./fixtures.cjs');
const budget = { month: '2026-10', category: 'Food', limitAmount: 500000 };

test('budgets use exact category expenses across accounts and the transaction month', () => {
  const transactions = [record({ amount: 120000 }), record({ id: 'other', accountId: 'bank', category: 'Bills', amount: 10000 }), record({ id: 'old', amount: 30000, transactionDate: '2026-09-30' }), record({ id: 'income', type: 'INCOME', category: 'Salary', amount: 50000 }), record({ id: 'transfer', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 50000 })];
  const report = budgetReport([budget], transactions, '2026-10');
  assert.equal(report.rows[0].spent, 120000);
  assert.equal(report.rows[0].remaining, 380000);
  assert.equal(report.rows[0].progress, .24);
  assert.equal(report.rows[0].status, 'Within budget');
  assert.deepEqual(report.unbudgeted, [{ category: 'Bills', amount: 10000 }]);
  assert.equal(budgetReport([budget], [], '2026-10').rows[0].spent, 0);
  assert.equal(budgetReport([budget], [record({ amount: 500000 })], '2026-10').rows[0].status, 'Limit reached');
  assert.equal(budgetReport([budget], [record({ amount: 500001 })], '2026-10').rows[0].remaining, -1);
  assert.equal(budgetReport([budget], [record({ amount: 500001 })], '2026-10').rows[0].status, 'Over budget');
});
test('budget validation rejects duplicates, invalid limits and unsafe sums', () => {
  for (const limitAmount of [0, -1, .5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => validateBudget({ ...budget, limitAmount }));
  assert.throws(() => validateBudget({ ...budget, category: 'Salary' }));
  assert.throws(() => validateBudget({ ...budget, month: '2026-13' }));
  assert.throws(() => budgetReport([budget, budget], [], budget.month));
  assert.throws(() => budgetReport([{ ...budget, limitAmount: Number.MAX_SAFE_INTEGER }, { ...budget, category: 'Bills' }], [], budget.month));
});
test('budget payloads round trip, reject malformed data and support all older versions', () => {
  const payload = parseBackup(serializeBackup(cash, [], undefined, [], [budget]));
  assert.equal(payload.version, 6);
  assert.deepEqual(payload.budgets, [budget]);
  assert.equal(previewBackup(payload).budgetCount, 1);
  assert.throws(() => parseBackup(JSON.stringify({ ...payload, budgets: [budget, budget] })));
  assert.throws(() => parseBackup(JSON.stringify({ ...payload, budgets: [{ ...budget, limitAmount: 0 }] })));
  for (const version of [1, 2, 3, 4, 5]) {
    const legacy = { ...payload, version, budgets: undefined, goals: version === 5 ? [] : undefined };
    const parsed = parseBackup(JSON.stringify(legacy));
    assert.deepEqual(parsed.budgets ?? [], []);
    assert.doesNotThrow(() => parseBackup(JSON.stringify(parsed)));
  }
});

const { budgetFeedback } = require('../../.expo/finance-tests/budgets.js');
test('budget feedback distinguishes allowances from available cash and other months', () => {
  const row = budgetReport([budget], [], budget.month).rows[0];
  assert.match(budgetFeedback(row, 30000, row.remaining, true).details.join(' '), /but spending accounts/);
  assert.match(budgetFeedback(row, 0, row.remaining, true).details.join(' '), /not cash/);
  assert.match(budgetFeedback(row, -100, row.remaining, true).details.join(' '), /negative/);
  assert.match(budgetFeedback(row, 600000, 700000, true).details.join(' '), /Prioritize/);
  assert.match(budgetFeedback(row, 600000, row.remaining, true).details.join(' '), /upcoming bills/);
  assert.match(budgetFeedback(row, 0, row.remaining, false).details.join(' '), /not compared/);
  assert.doesNotMatch(budgetFeedback(row, 0, row.remaining, false).details.join(' '), /No available/);
  assert.match(budgetFeedback(row, 600000, row.remaining, true).details.join(' '), /No spending/);
});
test('budget feedback covers near-limit, reached and overspent categories with exact amounts', () => {
  const near = budgetReport([budget], [record({ amount: 400000 })], budget.month).rows[0];
  assert.match(budgetFeedback(near, 600000, near.remaining, true).message, /close to the limit/);
  const reached = budgetReport([budget], [record({ amount: 500000 })], budget.month).rows[0];
  assert.match(budgetFeedback(reached, 600000, 0, true).message, /limit reached/);
  const over = budgetReport([budget], [record({ amount: 500001 })], budget.month).rows[0];
  assert.match(budgetFeedback(over, 600000, 0, true).message, /0\.01 over/);
  assert.match(budgetFeedback(over, 600000, 0, true).details.join(' '), /does not change your balance/);
});
