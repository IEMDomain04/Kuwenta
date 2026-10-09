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

test('creation Undo removes only its record and keeps another identical expense', async (t) => {
  const db = await setup(t);
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'first', expense());
  await createTransaction(db, 'second', expense());
  await deleteTransaction(db, 'second');
  assert.deepEqual((await listTransactions(db)).map((row) => row.id), ['first']);
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 88000);
  await createTransaction(db, 'fresh-submission', expense());
  assert.equal((await listTransactions(db)).length, 2);
});

test('editing type/category/date/time and clearing notes updates the right report', async (t) => {
  const db = await setup(t);
  const original = await createTransaction(db, 'edited', record({ notes: 'Lunch' }));
  const edited = await updateTransaction(db, 'edited', record({ type: 'INCOME', category: 'Gift', amount: 50000,
    transactionDate: '2026-09-30', transactionTime: '23:59:59', notes: undefined }));
  assert.equal(edited.createdAt, original.createdAt);
  assert.equal(edited.notes, undefined);
  const rows = await listTransactions(db);
  assert.equal(calculateAccountSummary(await getCashAccount(db), rows, '2026-10').monthlyExpenses, 0);
  assert.equal(calculateAccountSummary(await getCashAccount(db), rows, '2026-09').monthlyIncome, 50000);
});

test('backup reads a validated SQLite snapshot without changing stored records', async (t) => {
  const { readBackupJson } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  const db = await setup(t);
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'income', income());
  await createTransaction(db, 'expense', expense());
  let transactionsStarted = 0;
  const wrapped = {
    ...db,
    withExclusiveTransactionAsync: (operation) => {
      transactionsStarted++;
      return db.withExclusiveTransactionAsync(operation);
    },
  };
  const before = await listTransactions(db);
  const backup = parseBackup(await readBackupJson(wrapped));
  assert.equal(transactionsStarted, 1);
  assert.deepEqual(backup.transactions, JSON.parse(JSON.stringify(before)));
  assert.equal(backup.accounts[0].openingBalance, 100000);
  assert.equal(calculateAccountSummary(backup.accounts[0], backup.transactions, '2026-10').balance, 138000);
  assert.deepEqual(await listTransactions(db), before);
});

function backupFixture(accountOverrides = {}, rows = [
  record({ id: 'restored-income', type: 'INCOME', category: 'Salary', amount: 50000 }),
  record({ id: 'restored-expense', notes: 'Lunch ₱120', updatedAt: '2026-10-09T07:00:00.000Z' }),
]) {
  const { serializeBackup, parseBackup } = require('../../.expo/finance-tests/backup.js');
  const { cash } = require('./fixtures.cjs');
  return parseBackup(serializeBackup({ ...cash, ...accountOverrides }, rows, '2026-10-09T06:35:00.000Z'));
}

test('restore replaces old records and preserves centavos, IDs, PH time, notes and audit timestamps', async (t) => {
  const { restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const db = await setup(t);
  await createTransaction(db, 'old-record', expense());
  const backup = backupFixture();
  await restoreBackup(db, backup);
  assert.equal(await getTransaction(db, 'old-record'), null);
  assert.deepEqual(await getCashAccount(db), backup.accounts[0]);
  const rows = await listTransactions(db);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)).sort((a, b) => a.id.localeCompare(b.id)),
    [...backup.transactions].sort((a, b) => a.id.localeCompare(b.id)));
  assert.deepEqual(calculateAccountSummary(await getCashAccount(db), rows, '2026-10'), {
    balance: 138000, monthlyIncome: 50000, monthlyExpenses: 12000, hasNegativeBalance: false,
  });
});

test('invalid restore payloads fail before opening a write transaction and preserve original data', async (t) => {
  const { restoreBackup, readBackupJson } = require('../../.expo/finance-tests/storage/backup.js');
  const db = await setup(t);
  await createTransaction(db, 'old-record', expense());
  const before = await readBackupJson(db);
  let writes = 0;
  const wrapped = { ...db, withExclusiveTransactionAsync: async () => { writes++; } };
  for (const mutate of [
    (v) => { v.transactions[0].amount = -1; },
    (v) => { v.transactions.push({ ...v.transactions[0] }); },
    (v) => { v.transactions[0].accountId = 'missing'; },
    (v) => { v.version = 2; },
  ]) {
    const backup = backupFixture();
    mutate(backup);
    await assert.rejects(() => restoreBackup(wrapped, backup));
  }
  assert.equal(writes, 0);
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  const after = parseBackup(await readBackupJson(db));
  const original = parseBackup(before);
  assert.deepEqual(after.accounts, original.accounts);
  assert.deepEqual(after.transactions, original.transactions);
});

test('a failure after deletion, account update and one insert rolls back the entire restore', async (t) => {
  const { restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const db = await setup(t);
  await updateOpeningBalance(db, 123);
  await createTransaction(db, 'old-record', expense());
  const beforeAccount = await getCashAccount(db);
  const beforeRows = await listTransactions(db);
  let inserts = 0;
  const wrapped = { ...db, withExclusiveTransactionAsync: (operation) =>
    db.withExclusiveTransactionAsync((transaction) => operation({
      ...transaction,
      runAsync: async (sql, ...params) => {
        if (sql.startsWith('INSERT INTO transactions') && ++inserts === 2) throw new Error('Injected insert failure');
        return transaction.runAsync(sql, ...params);
      },
    })),
  };
  await assert.rejects(() => restoreBackup(wrapped, backupFixture()), /Injected insert failure/);
  assert.equal(inserts, 2);
  assert.deepEqual(await getCashAccount(db), beforeAccount);
  assert.deepEqual(await listTransactions(db), beforeRows);
});

test('restoring the same backup repeatedly or concurrently replaces records without duplication', async (t) => {
  const { restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const db = await setup(t);
  const backup = backupFixture();
  await restoreBackup(db, backup);
  await Promise.all([restoreBackup(db, backup), restoreBackup(db, backup)]);
  assert.equal((await listTransactions(db)).length, 2);
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 138000);
});

test('restore supports empty history, signed openings, archived flags and backdated reports', async (t) => {
  const { restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const db = await setup(t);
  await createTransaction(db, 'old-record', expense());
  await restoreBackup(db, backupFixture({ openingBalance: -100, archived: true, includedInAvailable: false }, []));
  assert.equal((await listTransactions(db)).length, 0);
  assert.equal((await getCashAccount(db)).archived, true);
  assert.equal((await getCashAccount(db)).includedInAvailable, false);
  assert.equal(calculateAccountSummary(await getCashAccount(db), [], '2026-10').balance, -100);
  await restoreBackup(db, backupFixture({}, [record({ transactionDate: '2026-09-30', transactionTime: '23:59:59' })]));
  const rows = await listTransactions(db);
  assert.equal(calculateAccountSummary(await getCashAccount(db), rows, '2026-09').monthlyExpenses, 12000);
  assert.equal(calculateAccountSummary(await getCashAccount(db), rows, '2026-10').monthlyExpenses, 0);
});

test('restore refuses an unsupported multi-account database before deleting records', async (t) => {
  const { restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const db = await setup(t);
  await createTransaction(db, 'old-record', expense());
  await db.runAsync("INSERT INTO accounts VALUES ('other', 'Other', 'PHP', 0, 'spending', 1, 0)");
  const before = await listTransactions(db);
  await assert.rejects(() => restoreBackup(db, backupFixture()), /only the Cash account/);
  assert.deepEqual(await listTransactions(db), before);
  assert.equal((await db.getAllAsync('SELECT id FROM accounts')).length, 2);
});

test('restored records persist after closing and reopening the disk database', async () => {
  const { restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const directory = mkdtempSync(join(tmpdir(), 'kuwenta-restore-'));
  const filename = join(directory, 'finance.db');
  let db = connect(filename);
  try {
    await initializeDatabase(db);
    await restoreBackup(db, backupFixture());
    db.close(); db = connect(filename);
    await initializeDatabase(db);
    const rows = await listTransactions(db);
    assert.equal(rows.length, 2);
    assert.equal(calculateAccountSummary(await getCashAccount(db), rows, '2026-10').balance, 138000);
    assert.equal((await getTransaction(db, 'restored-expense')).notes, 'Lunch ₱120');
  } finally {
    db.close();
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});
