const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectAssistantInsight, parseInsightSelection, buildInsightContext } = require('../../.expo/finance-tests/assistant-insights.js');
const { checkedAssistantReply } = require('../../.expo/finance-tests/assistant-context.js');
const { budgetPeriodKey } = require('../../.expo/finance-tests/budget-periods.js');
const { cash, record } = require('./fixtures.cjs');
const now = new Date('2026-10-16T04:00:00Z');
const cafe = 'Caf\u00e9';
const data = { accounts: [{ ...cash, openingBalance: 53500 }], transactions: [record({ category: cafe, amount: 24900 }), record({ id: 'meal', category: 'Meals', amount: 20000 }), record({ id: 'fare', category: 'Transport', amount: 6600 })], budgets: [], goals: [] };
const build = (selection, question = 'Explain this', snapshot = data) => buildInsightContext(snapshot, { period: '2026-10', ...selection }, question, now);

test('selected category explains its exact share and comparison instead of unrelated balances', () => {
  const selection = selectAssistantInsight(cafe + ' is your largest expense category for October 2026: PHP 249 recorded.', data, now);
  assert.equal(selection.kind, 'category'); assert.equal(selection.category, cafe);
  assert.deepEqual(parseInsightSelection(JSON.stringify(selection)), selection);
  const result = build(selection);
  assert.match(result.fallback, /48%/); assert.match(result.fallback, /249.*515/); assert.match(result.fallback, /Meals.*200/);
  assert.ok(!result.fallback.includes('available for spending'));
  assert.ok(result.fallback.includes('does not mean you overspent'));
  assert.ok(checkedAssistantReply(result.fallback, result, ''));
  assert.equal(checkedAssistantReply('You have PHP 20 available for spending.', result, ''), undefined);
});
test('matched-date category comparisons exclude the unmatched tail and do not invent missing history', () => {
  const snapshot = { ...data, transactions: [...data.transactions, record({ id: 'old', category: cafe, amount: 10000, transactionDate: '2026-09-09' }), record({ id: 'late', category: cafe, amount: 80000, transactionDate: '2026-09-29' })] };
  const result = build({ kind: 'category', category: cafe }, 'Compared with last month?', snapshot);
  assert.match(result.fallback, /149 higher/); assert.match(result.fallback, /Days 1-16/); assert.match(result.fallback, /100/); assert.ok(!result.fallback.includes('800'));
  assert.match(build({ kind: 'comparison' }).fallback, /not enough comparable records/);
  assert.ok(checkedAssistantReply(result.fallback, result, ''));
});
test('selected daily budget retains its own scope and explains excess spending', () => {
  const key = budgetPeriodKey('daily', '2026-10-16');
  const snapshot = { ...data, budgets: [{ month: key, category: 'Meals', limitAmount: 5000 }, { month: '2026-10', category: 'Meals', limitAmount: 90000 }], transactions: [record({ category: 'Meals', amount: 6000, transactionDate: '2026-10-16' })] };
  const selection = selectAssistantInsight('Meals is PHP 10 over budget for Oct 16, 2026.', snapshot, now);
  assert.equal(selection.period, key);
  const result = build(selection, 'Why?', snapshot);
  assert.match(result.fallback, /10 over.*60.*50/s); assert.ok(!result.fallback.includes('900'));
  assert.ok(checkedAssistantReply(result.fallback, result, ''));
});
test('income explanations do not promise repeat income; transfers stay out', () => {
  const snapshot = { ...data, accounts: [cash, { ...cash, id: 'bank', name: 'Bank', openingBalance: 0 }], transactions: [record({ type: 'INCOME', category: 'Allowance', amount: 50000 }), record({ id: 'move', type: 'TRANSFER', category: 'Transfer', amount: 10000, destinationAccountId: 'bank' })] };
  const result = build({ kind: 'income', category: 'Allowance' }, 'Explain this', snapshot);
  assert.match(result.fallback, /Allowance.*500/); assert.match(result.fallback, /not a promise/); assert.ok(!result.fallback.includes('600'));
  assert.ok(checkedAssistantReply(result.fallback, result, ''));
});
test('savings, goal and negative-account explanations retain the correct accounting meaning', () => {
  const savings = { ...cash, id: 'bank', name: 'Savings', purpose: 'savings', includedInAvailable: false, openingBalance: 0 };
  const goal = { id: 'goal', name: 'Laptop', accountId: 'bank', targetAmount: 100000, createdAt: record().createdAt, updatedAt: record().updatedAt };
  const snapshot = { ...data, accounts: [cash, savings], goals: [goal], transactions: [record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 50000, sourcePurpose: 'spending', destinationPurpose: 'savings' })] };
  const saved = build({ kind: 'savings' }, 'Why?', snapshot);
  assert.match(saved.fallback, /500 recorded in savings.*500 moved into savings/s); assert.match(saved.fallback, /not automatically income/);
  const progress = build({ kind: 'goal', goalId: 'goal' }, 'Why?', snapshot);
  assert.match(progress.fallback, /500 more.*500 against a .*1,000/s);
  const account = build({ kind: 'account', accountId: 'cash' }, 'Why?', { ...snapshot, accounts: [{ ...cash, openingBalance: -10000 }, savings], transactions: [] });
  assert.match(account.fallback, /-.*100 recorded/);
  for (const result of [saved, progress, account]) assert.ok(checkedAssistantReply(result.fallback, result, ''));
});
test('aggregate budgets, sparse activity, missing selections and future entries have honest explanations', () => {
  const snapshot = { ...data, budgets: [{ month: '2026-10', category: 'Meals', limitAmount: 30000 }] };
  assert.match(build({ kind: 'budget' }, 'Why?', snapshot).fallback, /200.*300.*Each category/s);
  assert.match(build({ kind: 'activity' }, 'Why?', { ...data, transactions: [] }).fallback, /not enough transaction history/);
  assert.match(build({ kind: 'goal', goalId: 'missing' }).fallback, /not enough recorded activity/);
  const future = { ...data, transactions: [...data.transactions, record({ id: 'future', category: cafe, amount: 99999, transactionDate: '2026-11-01' })] };
  assert.equal(build({ kind: 'category', category: cafe }, 'Explain', future).fallback, build({ kind: 'category', category: cafe }).fallback);
  assert.equal(parseInsightSelection('{"kind":"category","period":"invalid"}'), undefined);
});


test('Why and reduction followups explain the selected category without restarting a balance summary', () => {
  const why = build({ kind: 'category', category: cafe }, 'Why?');
  const reduce = build({ kind: 'category', category: cafe }, 'How can I reduce it?');
  assert.match(why.fallback, /It stands out because.*249.*515/);
  assert.match(reduce.fallback, /choose which you could reduce or skip/);
  assert.notEqual(why.fallback, reduce.fallback);
  for (const result of [why, reduce]) { assert.ok(!result.fallback.includes('available for spending')); assert.ok(checkedAssistantReply(result.fallback, result, '')); }
});
