const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDraft, validateAccount, validateManualRecord } = require('../../.expo/finance-tests/validation.js');
const { cash, record } = require('./fixtures.cjs');

test('valid backdated entry with no notes is accepted', () => {
  assert.doesNotThrow(() => validateDraft(record({ transactionDate: '2026-09-01' }), cash));
  assert.doesNotThrow(() => validateAccount({ ...cash, openingBalance: -100 }));
});
test('required fields and amount constraints reject invalid drafts', () => {
  for (const changes of [
    { type: 'TRANSFER' }, { amount: 0 }, { amount: -1 }, { amount: 1.1 }, { amount: NaN },
    { amount: Number.MAX_SAFE_INTEGER + 1 }, { accountId: '' }, { accountId: 'missing' },
    { category: '' }, { type: 'INCOME', category: 'Food' }, { transactionDate: '' },
    { transactionDate: '2026-02-30' }, { transactionTime: '' }, { transactionTime: '24:00:00' }, { notes: 123 },
  ]) assert.throws(() => validateDraft(record(changes), cash), JSON.stringify(changes));
  assert.throws(() => validateDraft(record(), { ...cash, archived: true }));
});
test('accounts require PHP, valid identifiers, flags and integer opening balance', () => {
  for (const changes of [{ currency: 'USD' }, { id: '' }, { name: ' ' }, { purpose: 'other' },
    { openingBalance: 0.1 }, { includedInAvailable: 1 }, { archived: null }]) {
    assert.throws(() => validateAccount({ ...cash, ...changes }));
  }
});
test('stored records validate IDs, timestamps and unsupported fields', () => {
  assert.doesNotThrow(() => validateManualRecord(record()));
  for (const changes of [{ id: '' }, { createdAt: '' }, { updatedAt: '2026-10-08T06:35:00.000Z' },
    { type: 'ADJUSTMENT' }, { destinationAccountId: 'savings' }, { adjustmentDirection: 'increase' }]) {
    assert.throws(() => validateManualRecord(record(changes)));
  }
});

test('blank account names produce a field notice without exposing account IDs', () => {
  assert.throws(() => validateAccount({ ...cash, name: '  ' }), { message: 'Enter an account name.' });
});
