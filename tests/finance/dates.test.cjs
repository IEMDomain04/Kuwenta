const { test } = require('node:test');
const assert = require('node:assert/strict');
const { philippineDateTime, isValidDate, isValidTime, isUtcTimestamp } = require('../../.expo/finance-tests/dates.js');

test('Philippine midnight uses the correct date and reporting month', () => {
  assert.deepEqual(philippineDateTime(new Date('2026-09-30T15:59:59Z')), {
    transactionDate: '2026-09-30', transactionTime: '23:59:59',
  });
  assert.deepEqual(philippineDateTime(new Date('2026-09-30T16:00:00Z')), {
    transactionDate: '2026-10-01', transactionTime: '00:00:00',
  });
  assert.deepEqual(philippineDateTime(new Date('2026-12-31T16:00:00Z')), {
    transactionDate: '2027-01-01', transactionTime: '00:00:00',
  });
});
test('defaults do not depend on the device timezone', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/Los_Angeles', 'UTC', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      assert.deepEqual(philippineDateTime(new Date('2026-10-09T06:35:00Z')), {
        transactionDate: '2026-10-09', transactionTime: '14:35:00',
      });
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
test('calendar dates reject impossible days and validate leap years', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-10-00', '2026-1-1', '', '1899-12-31']) {
    assert.equal(isValidDate(value), false, value);
  }
});
test('time requires a valid 24-hour clock including seconds', () => {
  assert.equal(isValidTime('23:59:59'), true);
  assert.equal(isValidTime('00:00:00'), true);
  for (const value of ['', '24:00:00', '12:60:00', '12:00:60', '2:00:00', '14:35', '2:35 PM']) {
    assert.equal(isValidTime(value), false, value);
  }
});
test('audit timestamps use UTC and invalid instants are rejected', () => {
  assert.equal(isUtcTimestamp('2026-10-09T06:35:00.000Z'), true);
  assert.equal(isUtcTimestamp('2026-02-30T06:35:00.000Z'), false);
  assert.equal(isUtcTimestamp('2026-10-09T14:35:00+08:00'), false);
  assert.throws(() => philippineDateTime(new Date('invalid')));
});

test('picker values represent Philippine wall time independently of the host timezone', () => {
  const { transactionPickerValue, readableTransactionDate } = require('../../.expo/finance-tests/dates.js');
  assert.equal(transactionPickerValue('2026-10-10', '00:05:37').toISOString(), '2026-10-09T16:05:37.000Z');
  assert.equal(readableTransactionDate('2026-10-10'), 'October 10, 2026');
  assert.throws(() => transactionPickerValue('2026-02-30', '12:00:00'));
  assert.throws(() => transactionPickerValue('2026-10-10', '25:00:00'));
});

test('time selections preserve seconds when minutes are unchanged and reset them when changed', () => {
  const { pickedTransactionTime } = require('../../.expo/finance-tests/dates.js');
  assert.equal(pickedTransactionTime(new Date('2026-10-10T06:35:00Z'), '14:35:37'), '14:35:37');
  assert.equal(pickedTransactionTime(new Date('2026-10-10T06:36:59Z'), '14:35:37'), '14:36:00');
  assert.equal(pickedTransactionTime(new Date('2026-10-09T16:00:00Z'), '23:59:37'), '00:00:00');
});
