const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cash, record } = require('./fixtures.cjs');
const { defaultEntryAccount, previewTransfer } = require('../../.expo/finance-tests/workflows.js');
const bank = { ...cash, id: 'bank', name: 'Bank', openingBalance: 0 };
test('context wins; remembered accounts must be active and different from the destination', () => {
  assert.equal(defaultEntryAccount([cash, bank], 'bank', 'cash'), 'bank');
  assert.equal(defaultEntryAccount([cash, bank], undefined, 'bank'), 'bank');
  assert.equal(defaultEntryAccount([cash, { ...bank, archived: true }], undefined, 'bank'), 'cash');
  assert.equal(defaultEntryAccount([cash, bank], undefined, 'bank', 'bank'), 'cash');
  assert.equal(defaultEntryAccount([], undefined, 'bank'), '');
});
test('transfer preview is exact, excludes an edited record, and never mutates records', () => {
  const draft = { ...record(), type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 20000 };
  const accounts = [{ ...cash, openingBalance: 61800 }, bank];
  assert.deepEqual(previewTransfer(accounts, [], draft), { sourceBalance: 41800, destinationBalance: 20000 });
  const original = { ...draft, id: 'old' };
  assert.deepEqual(previewTransfer(accounts, [original], { ...draft, amount: 10000 }, original), { sourceBalance: 51800, destinationBalance: 10000 });
  assert.equal(original.amount, 20000);
  assert.deepEqual(previewTransfer(accounts, [{ ...original, id: 'transfer-preview' }], draft), { sourceBalance: 21800, destinationBalance: 40000 });
  assert.throws(() => previewTransfer(accounts, [], { ...draft, destinationAccountId: 'cash' }));
  assert.throws(() => previewTransfer(accounts, [], { ...draft, amount: Number.MAX_SAFE_INTEGER + 1 }));
});
