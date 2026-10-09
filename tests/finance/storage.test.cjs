const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, readdirSync, unlinkSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { initializeDatabase } = require('../../.expo/finance-tests/storage/database.js');
const { getCashAccount, updateOpeningBalance } = require('../../.expo/finance-tests/storage/accounts.js');
const { createTransactionId, createTransaction, getTransaction, listTransactions, updateTransaction, deleteTransaction } = require('../../.expo/finance-tests/storage/transactions.js');
const { calculateAccountSummary } = require('../../.expo/finance-tests/calculations.js');
const { record } = require('./fixtures.cjs');

// Real SQLite with a small adapter for the Expo async methods used by storage.
// This verifies SQL/operations, not Expo's Android native connection behavior.
function connect(filename = ':memory:') {
  const native = new DatabaseSync(filename);
  let tail = Promise.resolve();
  const db = {
    execAsync: async (sql) => { native.exec(sql); },
    getFirstAsync: async (sql, ...params) => native.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => native.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => {
      const result = native.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    withExclusiveTransactionAsync: (task) => {
      const operation = tail.then(async () => {
        native.exec('BEGIN');
        try { await task(db); native.exec('COMMIT'); }
        catch (error) { native.exec('ROLLBACK'); throw error; }
      });
      tail = operation.catch(() => {});
      return operation;
    },
    close: () => native.close(),
  };
  return db;
}
async function setup(t) {
  const db = connect();
  t.after(() => db.close());
  await initializeDatabase(db);
  return db;
}
const expense = () => record();
const income = () => record({ type: 'INCOME', category: 'Salary', amount: 50000 });

test('initialization creates Cash exactly once and preserves records/opening balance', async (t) => {
  const db = await setup(t);
  assert.deepEqual(await getCashAccount(db), {
    id: 'cash', name: 'Cash', currency: 'PHP', openingBalance: 0,
    purpose: 'spending', includedInAvailable: true, archived: false,
  });
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'income', income());
  await createTransaction(db, 'expense', expense());
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS total FROM accounts')).total, 1);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 1);
  assert.deepEqual(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10'), {
    balance: 138000, monthlyIncome: 50000, monthlyExpenses: 12000, hasNegativeBalance: false,
  });
});

test('records survive closing and reopening a disk database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kuwenta-storage-'));
  const filename = join(directory, 'finance.db');
  let db = connect(filename);
  try {
    await initializeDatabase(db);
    await updateOpeningBalance(db, -100);
    await createTransaction(db, 'expense', expense());
    db.close(); db = connect(filename);
    await initializeDatabase(db);
    assert.equal((await getCashAccount(db)).openingBalance, -100);
    assert.equal((await getTransaction(db, 'expense')).amount, 12000);
    assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, -12100);
  } finally {
    db.close();
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});

test('same submission ID saves once while separate identical expenses remain valid', async (t) => {
  const db = await setup(t);
  const id = await createTransactionId(db);
  assert.match(id, /^[0-9a-f]{32}$/);
  const [first, retry] = await Promise.all([createTransaction(db, id, expense()), createTransaction(db, id, expense())]);
  assert.deepEqual(first, retry);
  assert.equal((await listTransactions(db)).length, 1);
  const secondId = await createTransactionId(db);
  assert.notEqual(id, secondId);
  await createTransaction(db, secondId, expense());
  assert.equal((await listTransactions(db)).length, 2);
});

test('edits preserve creation timestamp, recalculate totals, and retries never overwrite', async (t) => {
  const db = await setup(t);
  await updateOpeningBalance(db, 100000);
  const first = await createTransaction(db, 'expense', expense());
  const edited = await updateTransaction(db, 'expense', record({ amount: 20000, notes: "Lunch at Mama's" }));
  assert.equal(edited.createdAt, first.createdAt);
  assert.ok(edited.updatedAt >= first.updatedAt);
  assert.equal(edited.notes, "Lunch at Mama's");
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 80000);
  const retried = await createTransaction(db, 'expense', expense());
  assert.equal(retried.amount, 20000);
  await deleteTransaction(db, 'expense');
  await deleteTransaction(db, 'expense'); // safe repeated deletion
  assert.equal(await getTransaction(db, 'expense'), null);
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 100000);
});

test('history uses Philippine date and time with a stable ID tie-breaker', async (t) => {
  const db = await setup(t);
  for (const [id, date, time] of [['early', '2026-09-30', '23:59:59'], ['morning', '2026-10-01', '08:00:00'], ['late', '2026-10-01', '20:00:00']]) {
    await createTransaction(db, id, record({ transactionDate: date, transactionTime: time }));
  }
  assert.deepEqual((await listTransactions(db)).map((row) => row.id), ['late', 'morning', 'early']);
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-09').monthlyExpenses, 12000);
  await db.runAsync('UPDATE transactions SET transactionDate = ?, transactionTime = ?, createdAt = ?, updatedAt = ?',
    '2026-10-01', '20:00:00', '2026-10-09T00:00:00.000Z', '2026-10-09T00:00:00.000Z');
  assert.deepEqual((await listTransactions(db)).map((row) => row.id), ['morning', 'late', 'early']);
});

test('invalid writes leave original records unchanged', async (t) => {
  const db = await setup(t);
  const first = await createTransaction(db, 'expense', expense());
  for (const changes of [{ amount: 0 }, { amount: 1.5 }, { category: '' }, { accountId: 'missing' },
    { transactionDate: '2026-02-30' }, { transactionTime: '24:00:00' }, { type: 'TRANSFER' }]) {
    await assert.rejects(createTransaction(db, 'invalid', record(changes)));
    await assert.rejects(updateTransaction(db, 'expense', record(changes)));
  }
  await assert.rejects(updateTransaction(db, 'missing', expense()));
  await assert.rejects(updateOpeningBalance(db, 1.5));
  await assert.rejects(createTransaction(db, '', expense()));
  assert.deepEqual(await getTransaction(db, 'expense'), first);
  assert.equal((await listTransactions(db)).length, 1);
  assert.equal((await getCashAccount(db)).openingBalance, 0);
});

test('archived Cash blocks creation, editing and opening changes, preserving history', async (t) => {
  const db = await setup(t);
  await createTransaction(db, 'expense', expense());
  await db.runAsync("UPDATE accounts SET archived = 1 WHERE id = 'cash'");
  await assert.rejects(createTransaction(db, 'new', expense()));
  await assert.rejects(updateTransaction(db, 'expense', expense()));
  await assert.rejects(updateOpeningBalance(db, 0));
  assert.equal((await listTransactions(db)).length, 1);
});

test('database constraints reject invalid amounts, references and future operations', async (t) => {
  const db = await setup(t);
  await createTransaction(db, 'expense', expense());
  for (const [column, value] of [['amount', -1], ['amount', 0.5], ['accountId', 'missing'],
    ['transactionDate', '2026-02-30'], ['transactionDate', '2026-99-99'], ['transactionTime', '24:00:00'],
    ['type', 'TRANSFER'], ['destinationAccountId', 'cash']]) {
    await assert.rejects(db.runAsync(`UPDATE transactions SET ${column} = ? WHERE id = 'expense'`, value));
  }
  await assert.rejects(db.runAsync("DELETE FROM accounts WHERE id = 'cash'"));
  assert.equal((await getTransaction(db, 'expense')).amount, 12000);
});

test('migration failure rolls back schema and version; newer schema is rejected', async (t) => {
  const db = connect();
  t.after(() => db.close());
  const exec = db.execAsync;
  let fail = true;
  db.execAsync = async (sql) => {
    await exec(sql);
    if (fail && sql.includes('CREATE TABLE accounts')) throw new Error('Simulated initialization failure');
  };
  await assert.rejects(initializeDatabase(db));
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 0);
  assert.equal(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'accounts'"), null);
  fail = false;
  await initializeDatabase(db);
  await db.execAsync('PRAGMA user_version = 2');
  await assert.rejects(initializeDatabase(db), /newer version/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 2);
});

test('a failure after an edit write rolls back the original transaction', async (t) => {
  const db = await setup(t);
  const original = await createTransaction(db, 'expense', expense());
  const run = db.runAsync;
  db.runAsync = async (sql, ...params) => {
    const result = await run(sql, ...params);
    if (sql.startsWith('UPDATE transactions SET type')) throw new Error('Simulated write failure');
    return result;
  };
  await assert.rejects(updateTransaction(db, 'expense', record({ amount: 20000 })), /Simulated write failure/);
  assert.deepEqual(await getTransaction(db, 'expense'), original);
});
