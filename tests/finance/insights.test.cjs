const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moneyInsights, accountInsights } = require('../../.expo/finance-tests/insights.js');
const { cash, record } = require('./fixtures.cjs');
const now = new Date('2026-10-11T02:00:00Z');
const budget = limitAmount => [{ month: '2026-10', category: 'Food', limitAmount }];
const saving = { ...cash, id: 'save', name: 'Savings', openingBalance: 0, purpose: 'savings', includedInAvailable: false };

test('empty activity avoids spending feedback and shows a concise available-money summary', () => {
  assert.deepEqual(moneyInsights([cash], [], [], [], now), []);
  const result = accountInsights([cash], [], [], now);
  assert.equal(result.totalMoney, 100000);
  assert.equal(result.availableMoney, 100000);
  assert.equal(result.insights.length, 1);
  assert.match(result.insights[0], /available for spending/);
});
test('budget warnings precede observations and use the current month only', () => {
  const rows = [record(), record({ id: 'older', amount: 900000, transactionDate: '2026-09-09' })];
  const result = moneyInsights([cash], rows, budget(15000), [], now);
  assert.match(result[0], /80%.*30 remaining/);
  assert.ok(result.some(text => /120 recorded/.test(text) && text.includes('October 2026')));
  assert.match(result[1], /expenses exceed income/);
});
test('limit reached and overspending take priority over successful income', () => {
  const rows = [record({ amount: 15000 }), record({ id: 'income', type: 'INCOME', category: 'Freelance', amount: 200000 })];
  assert.match(moneyInsights([cash], rows, budget(15000), [], now)[0], /limit reached/);
  assert.match(moneyInsights([cash], [record({ amount: 16000 }), rows[1]], budget(15000), [], now)[0], /10 over budget/);
});
test('income source totals exclude transfers, external movements and future income', () => {
  const rows = [
    record({ id: 'a', type: 'INCOME', category: 'Freelance', amount: 50000 }),
    record({ id: 'b', type: 'INCOME', category: 'Freelance', amount: 40000 }),
    record({ id: 'c', type: 'INCOME', category: 'Salary', amount: 80000 }),
    record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', adjustmentDirection: 'increase', externalName: 'Friend', amount: 900000 }),
    record({ id: 'future', type: 'INCOME', category: 'Salary', amount: 900000, transactionDate: '2026-10-12' }),
    record({ id: 'move', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 20000 }),
  ];
  const messages = moneyInsights([cash, saving], rows, [], [], now);
  assert.ok(messages.some(text => /Freelance brought in.*900.*largest income source/.test(text)));
  assert.ok(!messages.some(text => /Salary brought|expenses exceed/.test(text)));
});
test('transfers are not income or expenses and savings goals retain exact progress', () => {
  const transfer = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 50000, sourcePurpose: 'spending', destinationPurpose: 'savings' });
  const goal = { id: 'goal', name: 'Emergency', accountId: 'save', targetAmount: 100000, createdAt: record().createdAt, updatedAt: record().updatedAt };
  const result = moneyInsights([cash, saving], [transfer], [], [goal], now);
  assert.match(result[0], /transferred into savings/);
  assert.match(result[1], /50% funded/);
  assert.ok(result.every(text => !text.includes('expense category')));
  assert.ok(moneyInsights([cash, saving], [transfer], [], [{ ...goal, targetAmount: 50000 }], now).some(text => text.includes('target reached')));
});
test('editing and deleting records recalculates insights without mutation', () => {
  const rows = Object.freeze([Object.freeze(record({ amount: 16000 }))]);
  assert.match(moneyInsights([cash], rows, budget(15000), [], now)[0], /over budget/);
  assert.ok(!moneyInsights([cash], [record({ amount: 1000 })], budget(15000), [], now).some(text => text.includes('over budget')));
  assert.deepEqual(moneyInsights([cash], [], budget(15000), [], now), []);
  assert.equal(rows[0].amount, 16000);
});
test('spending comparisons use matched dates and omit unavailable comparisons', () => {
  const rows = [record({ amount: 12000 }), record({ id: 'previous', amount: 10000, transactionDate: '2026-09-09' }), record({ id: 'later', amount: 900000, transactionDate: '2026-09-20' })];
  assert.ok(moneyInsights([cash], rows, [], [], now).some(text => /20 higher/.test(text) && /days 1-11/.test(text)));
  assert.ok(!moneyInsights([cash], [rows[0]], [], [], now).some(text => /compared/.test(text)));
  const end = new Date('2026-03-31T02:00:00Z');
  const matched = [record({ amount: 12000, transactionDate: '2026-03-27' }), record({ id: 'prior', amount: 10000, transactionDate: '2026-02-27' }), record({ id: 'unmatched', amount: 90000, transactionDate: '2026-03-31' })];
  assert.ok(moneyInsights([cash], matched, [], [], end).some(text => /20 higher/.test(text) && /days 1-28/.test(text)));
});
test('remaining budget allowances sum positive category balances, not overspending offsets', () => {
  const rows = [record({ amount: 16000 })];
  const budgets = [...budget(10000), { month: '2026-10', category: 'Transportation', limitAmount: 90000 }];
  const result = moneyInsights([cash], rows, budgets, [], now);
  assert.ok(result.some(text => /840.*below.*900/.test(text)));
  const funded = moneyInsights([cash], [record()], budget(15000), [], now);
  assert.ok(funded.some(text => /exceeds remaining budget limits.*850/.test(text) && /bills/.test(text)));
});
test('all applicable insights are retained instead of truncating the details to three', () => {
  const rows = [record(), record({ id: 'income', type: 'INCOME', category: 'Freelance', amount: 5000 }), record({ id: 'prior', transactionDate: '2026-09-09', amount: 1000 })];
  const result = moneyInsights([cash], rows, budget(15000), [], now);
  assert.ok(result.length > 3);
  assert.equal(new Set(result).size, result.length);
  assert.ok(result.some(text => /Freelance/.test(text)));
});
test('account balance breakdown includes archived and excluded accounts consistently', () => {
  const archived = { ...cash, id: 'old', name: 'Old wallet', openingBalance: 20000, archived: true };
  const result = accountInsights([cash, { ...saving, openingBalance: 40000 }, archived], [], [], now);
  assert.equal(result.totalMoney, 160000);
  assert.equal(result.availableMoney, 120000);
  assert.equal(result.balances.length, 3);
  assert.equal(result.insights.length, 1);
  assert.match(result.insights[0], /available for spending/);
});
test('negative balances are the first account insight and savings concentration gets useful feedback', () => {
  const accounts = [{ ...cash, openingBalance: -10000 }, { ...saving, openingBalance: 100000 }];
  const result = accountInsights(accounts, [], [], now);
  assert.match(result.insights[0], /Cash.*negative.*100/);
  assert.match(result.insights[1], /in savings.*available for spending/);
  const concentrated = accountInsights([{ ...cash, openingBalance: 5000 }, { ...saving, openingBalance: 100000 }], [], [], now);
  assert.match(concentrated.insights[0], /in savings.*50.*available/);
});
test('account declines require an actual 25% change within the last 30 days', () => {
  const result = accountInsights([cash], [record({ amount: 30000 })], [], now);
  assert.ok(result.insights.some(text => /fell by.*300.*last 30 days/.test(text)));
  assert.ok(accountInsights([cash], [record({ amount: 20000 })], [], now).insights.every(text => !text.includes('fell by')));
  assert.ok(accountInsights([cash], [record({ amount: 30000, transactionDate: '2026-08-01' })], [], now).insights.every(text => !text.includes('fell by')));
  assert.ok(accountInsights([cash], [record({ amount: 30000, transactionDate: '2026-10-12' })], [], now).insights.every(text => !text.includes('fell by')));
});
test('a decline caused by a transfer is described as a balance change, not spending', () => {
  const transfer = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 30000 });
  const result = accountInsights([cash, saving], [transfer], [], now);
  assert.equal(result.totalMoney, cash.openingBalance);
  assert.ok(result.insights.some(text => /fell by.*300/.test(text) && /transfers/.test(text)));
});
test('tied categories are identified honestly and future expenses do not trigger warnings', () => {
  const income = category => record({ id: category, type: 'INCOME', category, amount: 50000 });
  assert.ok(moneyInsights([cash], [income('Salary'), income('Freelance')], [], [], now).some(text => /tied for your largest income source/.test(text)));
  assert.deepEqual(moneyInsights([cash], [record({ transactionDate: '2026-10-12' })], budget(1000), [], now), []);
});


test('account summary shows savings before ordinary spending and preserves centavos', () => {
  const result = accountInsights([cash, { ...saving, openingBalance: 200050 }], [record({ amount: 12025 })], [], now);
  assert.equal(result.insights.length, 1);
  assert.match(result.insights[0], /2,000.50 in savings.*879.75 available/);
});

test('account spending summary excludes transfers, corrections, external funds and future expenses', () => {
  const rows = [
    record({ amount: 10050 }),
    record({ id: 'old', amount: 5000, transactionDate: '2026-09-01' }),
    record({ id: 'future', amount: 1000, transactionDate: '2026-10-12' }),
    record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', adjustmentDirection: 'increase', externalName: 'Friend', amount: 5000 }),
    record({ id: 'correction', type: 'ADJUSTMENT', category: 'Balance adjustment', adjustmentDirection: 'increase', amount: 1000 }),
    record({ id: 'transfer', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 2000 }),
  ];
  const accounts = [cash, { ...saving, purpose: 'spending', includedInAvailable: true }];
  const result = accountInsights(accounts, rows, [], now);
  assert.equal(result.insights.length, 1);
  assert.match(result.insights[0], /spent.*100.50 in October 2026.*899.50 available/);
  const empty = accountInsights([{ ...cash, openingBalance: 0 }], [], [], now);
  assert.deepEqual(empty.insights, ['Add your starting balances to see your money overview.']);
});
