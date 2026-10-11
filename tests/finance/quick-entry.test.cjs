const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseQuickEntry } = require('../../.expo/finance-tests/quick-entry.js');
const { cash } = require('./fixtures.cjs');
const now = new Date('2026-10-10T16:30:25.000Z');
const bank = { ...cash, id: 'bank', name: 'Bank 2' };
const parse = (text, accounts = [cash, bank], context, last) => parseQuickEntry(text, accounts, now, context, last);

test('Quick Entry prepares review drafts with exact amounts and documented English/Filipino categories', () => {
  assert.deepEqual(parse('Lunch 120').draft, { type: 'EXPENSE', accountId: 'cash', amount: 12000, category: 'Meals', transactionDate: '2026-10-11', transactionTime: '00:30:25', notes: 'Lunch' });
  assert.equal(parse('Salary 25,000').draft.type, 'INCOME');
  assert.equal(parse('Salary 25,000').draft.amount, 2500000);
  assert.equal(parse('Sahod 1000').draft.category, 'Salary');
  assert.equal(parse('Pamasahe 30 kahapon').draft.category, 'Transport');
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
  assert.match(unclear.warnings[0], /Choose a category/);
});

test('parsing is pure and never changes account records', () => {
  const accounts = Object.freeze([Object.freeze({ ...cash })]);
  const before = JSON.stringify(accounts);
  parse('Lunch 120', accounts);
  assert.equal(JSON.stringify(accounts), before);
});


test('load phrases create Mobile Load & Data expenses in the specified active account', () => {
 for (const phrase of ['Mobile load 100 from Cash', 'Bought load 100 using Bank 2', 'Prepaid airtime 100', 'Data promo 100', 'Nagpaload 100']) {
  const result = parse(phrase).draft;
  assert.equal(result.type, 'EXPENSE'); assert.equal(result.amount, 10000);
  assert.equal(result.category, 'Mobile Load & Data');
 }
 assert.equal(parse('Bought load 50 using Bank 2').draft.accountId, 'bank');
});
test('cash in and cash out are transfers, never income or expenses', () => {
 const incoming = parse('Cash in 500 from Cash to Bank 2').draft;
 assert.equal(incoming.type, 'TRANSFER'); assert.equal(incoming.category, 'Transfer');
 assert.equal(incoming.accountId, 'cash'); assert.equal(incoming.destinationAccountId, 'bank');
 assert.equal(incoming.amount, 50000);
 const outgoing = parse('Cash out 300 kahapon from Bank 2 to Cash').draft;
 assert.equal(outgoing.accountId, 'bank'); assert.equal(outgoing.destinationAccountId, 'cash');
 assert.equal(outgoing.transactionDate, '2026-10-10');
 assert.equal(parse('Transfer 200 from Cash to Bank 2').draft.type, 'TRANSFER');
 assert.equal(parse('Cash-in 500 from Cash to Bank 2').draft.type, 'TRANSFER');
});
test('incomplete, invalid or external transfers require clarification instead of guessing', () => {
 for (const phrase of ['Cash in 500 to Bank 2', 'Cash out 300', 'Cash in 500 from Cash', 'Cash in 500 from Cash to Cash', 'Cash in 500 from Cash to Unknown', 'Cash in -500 from Cash to Bank 2', 'Cash in 500 and 200 from Cash to Bank 2', 'Cash in 500 from External to Cash']) assert.throws(() => parse(phrase), phrase);
 assert.throws(() => parse('Cash in 500 from Cash to Bank 2', [cash, { ...bank, archived: true }]));
 assert.throws(() => parse('Cash in 500 from Cash to Bank 2', [cash, bank, { ...bank, id: 'duplicate' }]));
 const frozen = Object.freeze([Object.freeze({ ...cash }), Object.freeze({ ...bank })]);
 const before = JSON.stringify(frozen); parse('Cash in 500 from Cash to Bank 2', frozen); assert.equal(JSON.stringify(frozen), before);
});

test('student expenses and income map to categories and remain valid review drafts', () => {
 const { validateDraft } = require('../../.expo/finance-tests/validation.js');
 for (const [phrase, category] of [
  ['Chips 30','Snacks & Drinks'], ['Coffee 80','Café'], ['Keyboard 1000','Tech & Accessories'],
  ['Bag 500','School & Personal Items'], ['Games 100','Games & Entertainment'], ['Cash-out fee 15','Fees'],
  ['Part-time 500','Part-time Work'], ['Freelance 2000','Freelance'], ['Gift 500','Gifts'], ['Received 100','Other Income']
 ]) {
  const {draft} = parse(phrase);
  assert.equal(draft.category, category, phrase);
  validateDraft(draft, cash);
 }
});
