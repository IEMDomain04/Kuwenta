const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAssistantContext, checkedAssistantReply, assistantQuestionReply } = require('../../.expo/finance-tests/assistant-context.js');
const { buildInsightContext } = require('../../.expo/finance-tests/assistant-insights.js');
const { cheaperScenario, reserveScenario, frequencyScenario, goalScenario } = require('../../.expo/finance-tests/assistant-scenarios.js');
const { cash, record } = require('./fixtures.cjs');
const now = new Date('2026-10-11T02:00:00Z');
const base = { accounts: [cash], transactions: [], goals: [], budgets: [] };
const build = (question, data = base, history = []) => buildAssistantContext(data, question, history, now);
const user = text => ({ role: 'user', text });
function valid(context) { assert.ok(checkedAssistantReply(context.fallback, context, ''), context.fallback); }

test('a shortfall gets one illustrative cheaper option, without changing recorded balances', () => {
  const original = JSON.stringify(base);
  const context = build('Can I buy a 1200 peso controller?');
  assert.equal(context.purchase.shortfall, 20000);
  assert.match(context.hypothetical.text, /illustrative .*800.*200.*not a verified product price/);
  assert.equal(context.facts.filter(text => text.startsWith('HYPOTHETICAL')).length, 1);
  assert.ok(context.summary.some(text => text.startsWith('What-if only:')));
  assert.equal(JSON.stringify(base), original); valid(context);
});

test('a remaining essential allowance produces a conditional reserve comparison, not another deduction', () => {
  const data = { ...base, accounts: [{ ...cash, openingBalance: 150000 }], budgets: [{ month: '2026-10', category: 'Transport', limitAmount: 60000 }] };
  const context = build('Can I buy a keyboard for 700 pesos?', data);
  assert.equal(context.purchase.remaining, 80000);
  assert.match(context.hypothetical.text, /keep .*600 untouched.*200.*beyond it.*no money has been reserved/);
  valid(context);
});

test('reserve followups preserve the product price and the next price change preserves the reserve', () => {
  const history = [user('Can I buy a controller for 1200 pesos?')];
  const context = build('What if I keep PHP 300 untouched?', base, history);
  assert.equal(context.purchase.price, 120000);
  assert.match(context.hypothetical.text, /300 untouched.*500 more/); valid(context);
  const changed = build('What about 800 pesos?', base, [...history, user('What if I keep PHP 300 untouched?')]);
  assert.equal(changed.purchase.price, 80000); assert.match(changed.hypothetical.text, /100 more/); valid(changed);
});

test('frequency followups use the known unit price instead of treating the count as pesos', () => {
  const history = [user('Can I buy mami rice every day for 60 pesos?')];
  for (const question of ['What about three times a week?', 'What about 3 times a week?', 'three times a week']) {
    assert.equal(assistantQuestionReply(question, history), undefined);
    const context = build(question, base, history);
    assert.equal(context.purchase.price, 6000);
    assert.match(context.fallback, /3 times in one week costs .*180.*820/);
    assert.deepEqual(context.requiredAmounts, [100000, 18000, 82000]); valid(context);
  }
  const month = build('What about monthly?', base, history);
  assert.match(month.fallback, /30 days costs .*1,800/); valid(month);
});

test('goal timelines are conditional and accept a user contribution without predicting income', () => {
  const savings = { ...cash, id: 'bank', name: 'Savings', purpose: 'savings', includedInAvailable: false, openingBalance: 300000 };
  const goal = { id: 'goal', name: 'Laptop', accountId: 'bank', targetAmount: 500000, createdAt: record().createdAt, updatedAt: record().updatedAt };
  const data = { ...base, accounts: [cash, savings], goals: [goal] };
  const context = build('How can I reach my Laptop savings goal?', data);
  assert.match(context.hypothetical.text, /200 each week.*2,000.*10 weeks.*not a prediction/); valid(context);
  const monthly = build('What if I set aside 500 pesos each month?', data, [user('How can I reach my Laptop savings goal?')]);
  assert.match(monthly.hypothetical.text, /500 each month.*4 months/); valid(monthly);
  const monthlyHistory = [user('How can I reach my Laptop savings goal?'), user('What if I set aside 500 pesos each month?')];
  assert.match(build('Why?', data, monthlyHistory).hypothetical.text, /500 each month.*4 months/);
  const selected = buildInsightContext(data, { kind: 'goal', goalId: 'goal', period: '2026-10' }, 'Why?', now, monthlyHistory);
  assert.match(selected.hypothetical.text, /500 each month.*4 months/); valid(selected);
  const explained = buildInsightContext(data, { kind: 'goal', goalId: 'goal', period: '2026-10' }, 'How can I reach it?', now);
  assert.ok(explained.hypothetical); valid(explained);
});

test('not spending keeps the recorded available amount only if other activity also stays unchanged', () => {
  const data = { ...base, accounts: [{ ...cash, openingBalance: 80000 }], transactions: [record({ type: 'INCOME', category: 'Allowance', amount: 100000, transactionDate: '2026-11-01' })] };
  const context = build('What if I buy nothing this week?', data);
  assert.equal(context.purchase, undefined);
  assert.match(context.fallback, /800.*no other balance changes.*800.*essentials/);
  assert.ok(!context.fallback.includes('What price')); valid(context);
});

test('using excluded savings asks for the missing purchase price before creating a scenario', () => {
  const data = { ...base, accounts: [{ ...cash, openingBalance: 30000 }, { ...cash, id: 'bank', name: 'Savings', purpose: 'savings', includedInAvailable: false, openingBalance: 200000 }] };
  const context = build('Can I use my savings for a bag?', data);
  assert.match(context.fallback, /300.*2,000.*excluded.*What price/);
  assert.equal(context.hypothetical, undefined); valid(context);
});

test('category reduction explains an illustrative target without assuming purchases were unnecessary', () => {
  const data = { ...base, transactions: [record({ category: 'Meals', amount: 60000 })] };
  const context = buildInsightContext(data, { kind: 'category', category: 'Meals', period: '2026-10' }, 'How can I reduce it?', now);
  assert.match(context.hypothetical.text, /illustrative .*450.*600.*150.*assuming/);
  assert.match(context.fallback, /essentials/); valid(context);
});

test('overflow, no available money, and zero contributions do not create invalid scenarios', () => {
  assert.equal(cheaperScenario(0, 120000), undefined);
  assert.equal(cheaperScenario(-10000, 120000), undefined);
  assert.equal(goalScenario(100000, 0), undefined);
  assert.equal(goalScenario(100000, 10000, 0), undefined);
  assert.equal(frequencyScenario(100000, Number.MAX_SAFE_INTEGER), undefined);
  assert.equal(reserveScenario(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 10000), undefined);
});

test('new hypothetical amounts need conditional wording and invented amounts remain rejected', () => {
  const context = build('Can I buy a 1200 peso controller?');
  assert.equal(checkedAssistantReply('You have PHP 1000 available and are PHP 200 short. The controller costs PHP 800.', context, ''), undefined);
  assert.equal(checkedAssistantReply('You have PHP 1000 and are PHP 200 short. If you bought one for PHP 799, you would have PHP 201.', context, ''), undefined);
  valid(context);
});
