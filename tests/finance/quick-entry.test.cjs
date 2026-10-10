const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseQuickEntry } = require('../../.expo/finance-tests/quick-entry.js');
const { cash } = require('./fixtures.cjs');
const now = new Date('2026-10-10T16:30:25.000Z');
const bank = { ...cash, id: 'bank', name: 'Bank 2' };
const parse = (text, accounts = [cash, bank], context, last) => parseQuickEntry(text, accounts, now, context, last);

test('Quick Entry prepares review drafts with exact amounts and documented English/Filipino categories', () => {
  assert.deepEqual(parse('Lunch 120').draft, { type: 'EXPENSE', accountId: 'cash', amount: 12000, category: 'Food', transactionDate: '2026-10-11', transactionTime: '00:30:25', notes: 'Lunch' });
  assert.equal(parse('Salary 25,000').draft.type, 'INCOME');
  assert.equal(parse('Salary 25,000').draft.amount, 2500000);
  assert.equal(parse('Sahod 1000').draft.category, 'Salary');
  assert.equal(parse('Pamasahe 30 kahapon').draft.category, 'Transportation');
  assert.equal(parse('Groceries 1,500.50 from Cash').draft.amount, 150050);
  assert.equal(parse('Kape 0.50').draft.amount, 50);
  assert.equal(parse('Lunch PHP120').draft.amount, 12000);
});

test('Quick Entry uses exact active accounts, context and eligible last used accounts', () => {
  assert.equal(parse('Lunch 120 from Bank 2').draft.accountId, 'bank');
  assert.equal(parse('Lunch 120', undefined, 'bank', 'cash').draft.accountId, 'bank');
  assert.equal(parse('Lunch 120', undefined, undefined, 'bank').draft.accountId, 'bank');
  assert.equal(parse('Lunch 120', [cash, { ...bank, archived: true }], undefined, 'bank').draft.accountId, 'cash');
  assert.throws(() => parse('Lunch 120 from missing'));
  assert.throws(() => parse('Lunch 120 from Bank 2', [cash, { ...bank, archived: true }]));
  assert.throws(() => parse('Lunch 120 from Cash', [cash, { ...cash, id: 'duplicate' }]));
  assert.throws(() => parse('Lunch 120', []));
});

test('relative dates follow Philippine midnight and cross month/year correctly', () => {
  assert.equal(parse('Lunch 120 yesterday').draft.transactionDate, '2026-10-10');
  const draft = parseQuickEntry('Lunch 120 kahapon', [cash], new Date('2026-12-31T16:01:00Z')).draft;
  assert.equal(draft.transactionDate, '2026-12-31');
  assert.equal(draft.transactionTime, '00:01:00');
  assert.equal(parse('Lunch 120 ngayon').draft.transactionDate, '2026-10-11');
});

test('missing, ambiguous, invalid and unsupported phrases never become saveable guesses', () => {
  for (const phrase of ['', 'Lunch', 'Lunch -120', 'Lunch 0', 'Lunch .50', 'Lunch abc120', 'Lunch 1,00', 'Lunch 1.234', 'Salary 30k', 'Lunch 120 dinner 50', 'Lunch 120 yesterday today', 'Salary lunch 500', 'Lunch taxi 120', 'Transfer 120', 'Lunch 120 tomorrow', 'Lunch 120 last week', 'Lunch 120 monday', 'Lunch $120', 'Lunch 120; coffee', 'Lunch 90071992547409.92']) assert.throws(() => parse(phrase), phrase);
  assert.throws(() => parse('a'.repeat(251)));
  const unclear = parse('Something 120');
  assert.equal(unclear.draft.category, 'Other');
  assert.match(unclear.warnings[0], /could not be identified/);
});

test('parsing is pure and never changes account records', () => {
  const accounts = Object.freeze([Object.freeze({ ...cash })]);
  const before = JSON.stringify(accounts);
  parse('Lunch 120', accounts);
  assert.equal(JSON.stringify(accounts), before);
});
