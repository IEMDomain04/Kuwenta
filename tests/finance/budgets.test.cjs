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


test('rearranging the Home budget preview preserves hidden categories and validates stale entries', () => {
  const { mergeBudgetOrder } = require('../../.expo/finance-tests/budgets.js');
  assert.deepEqual(mergeBudgetOrder(['Meals','Snacks','Groceries','Bills','Games'], ['Groceries','Meals','Snacks']), ['Groceries','Meals','Snacks','Bills','Games']);
  assert.deepEqual(mergeBudgetOrder(['Meals','Snacks','Bills'], ['Bills','Meals']), ['Bills','Snacks','Meals']);
  assert.throws(() => mergeBudgetOrder(['Meals','Snacks'], ['Meals','Meals']));
  assert.throws(() => mergeBudgetOrder(['Meals','Snacks'], ['Bills']));
});


test('overall budgets count all expenses and fees, excluding income and balance movements', () => {
  const { OVERALL_BUDGET } = require('../../.expo/finance-tests/budgets.js');
  const overall = { ...budget, category: OVERALL_BUDGET, limitAmount: 50000 };
  const rows = [record({ category: 'Meals', amount: 12000 }), record({ id: 'bus', category: 'Transport', amount: 3000 }), record({ id: 'fee', category: 'Fees', amount: 4000 }), record({ id: 'income', type: 'INCOME', category: 'Salary', amount: 50000 }), record({ id: 'transfer', type: 'TRANSFER', destinationAccountId: 'bank', category: 'Transfer', amount: 20000 }), record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', adjustmentDirection: 'increase', externalName: 'Friend', amount: 10000 }), record({ id: 'adjustment', type: 'ADJUSTMENT', category: 'Balance adjustment', adjustmentDirection: 'increase', amount: 10000 }), record({ id: 'old', transactionDate: '2026-09-30', amount: 5000 })];
  const report = budgetReport([overall, { ...budget, category: 'Meals', limitAmount: 15000 }], rows, budget.month);
  assert.equal(report.rows[0].spent, 19000);
  assert.equal(report.rows[1].spent, 12000);
  assert.equal(report.totalLimit, 50000);
  assert.equal(report.budgetedSpent, 19000);
  assert.equal(report.remaining, 31000);
  assert.equal(report.positiveRemaining, 31000);
  assert.deepEqual(report.unbudgeted, []);
  assert.throws(() => budgetReport([overall, overall], [], budget.month), /Duplicate/);
  assert.equal(budgetReport([{ ...overall, limitAmount: 19000 }], rows, budget.month).rows[0].status, 'Limit reached');
  assert.equal(budgetReport([{ ...overall, limitAmount: 18000 }], rows, budget.month).positiveRemaining, 0);
});

test('overall budgets respect daily, weekly and monthly ranges and trigger alerts', () => {
  const { OVERALL_BUDGET, budgetGroups } = require('../../.expo/finance-tests/budgets.js');
  const { budgetAlertPlan } = require('../../.expo/finance-tests/notification-plan.js');
  const scopes = ['daily:2026-10-13', 'weekly:2026-10-12', '2026-10'];
  const budgets = scopes.map(month => ({ month, category: OVERALL_BUDGET, limitAmount: 10000 }));
  const rows = [record({ amount: 8000, transactionDate: '2026-10-13' }), record({ id: 'yesterday', category: 'Transport', amount: 1000, transactionDate: '2026-10-12' }), record({ id: 'earlier', amount: 2000, transactionDate: '2026-10-01' })];
  assert.deepEqual(budgetGroups(budgets, rows).map(group => group.budgetedSpent), [8000, 9000, 11000]);
  assert.deepEqual(budgetAlertPlan(budgets, rows, '2026-10', '2026-10-13').map(alert => alert.level), [2, 1, 1]);
  const empty = budgetReport(budgets, [], scopes[0]).rows[0];
  assert.match(budgetFeedback(empty, 100000, empty.remaining, true).details.join(' '), /this period/);
  assert.doesNotMatch(budgetFeedback(empty, 100000, empty.remaining, true).details.join(' '), /this category/);
});

test('overall budget totals reject unsafe spending and do not add overlapping category limits', () => {
  const { OVERALL_BUDGET } = require('../../.expo/finance-tests/budgets.js');
  const overall = { ...budget, category: OVERALL_BUDGET, limitAmount: Number.MAX_SAFE_INTEGER };
  assert.equal(budgetReport([overall, { ...budget, limitAmount: Number.MAX_SAFE_INTEGER }], [], budget.month).totalLimit, Number.MAX_SAFE_INTEGER);
  assert.throws(() => budgetReport([overall], [record({ amount: Number.MAX_SAFE_INTEGER }), record({ id: 'extra', category: 'Fees', amount: 1 })], budget.month), /supported range/);
});
