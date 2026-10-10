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
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
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
  await db.execAsync('PRAGMA user_version = 9');
  await assert.rejects(initializeDatabase(db), /newer version/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 9);
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
    (v) => { v.version = 7; },
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

test('confirmed restore replaces all accounts and history, including when restoring a legacy Cash-only payload', async (t) => {
  const { restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const db = await setup(t);
  await createTransaction(db, 'old-record', expense());
  await db.runAsync("INSERT INTO accounts VALUES ('other', 'Other', 'PHP', 0, 'spending', 1, 0)");
  await createTransaction(db, 'other-record', record({ accountId: 'other' }));
  const backup = backupFixture();
  backup.version = 1; delete backup.goals; delete backup.budgets;
  await restoreBackup(db, backup);
  assert.equal((await db.getAllAsync('SELECT id FROM accounts')).length, 1);
  assert.equal(await getTransaction(db, 'other-record'), null);
  assert.equal((await listTransactions(db)).length, backup.transactions.length);
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

test('version 1 migration preserves Cash amounts, IDs and timestamps and is repeatable', async (t) => {
  const db = await setup(t);
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'old-income', income());
  const before = await listTransactions(db);
  await db.execAsync('DROP INDEX transactions_all_history; PRAGMA user_version = 1;');
  await initializeDatabase(db);
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
  assert.equal((await getCashAccount(db)).openingBalance, 100000);
  assert.deepEqual(await listTransactions(db), before);
  assert.ok(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'transactions_all_history'"));
});
test('version 2 migration failure preserves the old database and version', async (t) => {
  const db = await setup(t);
  await createTransaction(db, 'old', expense());
  await db.execAsync('DROP INDEX transactions_all_history; PRAGMA user_version = 1;');
  const exec = db.execAsync;
  db.execAsync = async (sql) => {
    await exec(sql);
    if (sql.includes('CREATE INDEX IF NOT EXISTS transactions_all_history')) throw new Error('Migration failure');
  };
  await assert.rejects(initializeDatabase(db), /Migration failure/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 1);
  assert.equal((await getTransaction(db, 'old')).amount, 12000);
  assert.equal(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'transactions_all_history'"), null);
});
test('multiple accounts isolate balances; moving and deleting records recalculate both accounts', async (t) => {
  const { saveAccount, getAccount, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const { calculateFinanceSummary } = require('../../.expo/finance-tests/calculations.js');
  const { cash } = require('./fixtures.cjs');
  const db = await setup(t);
  const bank = { ...cash, id: 'bank', name: 'Bank', openingBalance: 200000, purpose: 'savings', includedInAvailable: false };
  await saveAccount(db, bank, true);
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'cash-expense', expense());
  await createTransaction(db, 'bank-income', record({ accountId: 'bank', type: 'INCOME', category: 'Salary', amount: 50000 }));
  assert.equal(calculateAccountSummary(await getAccount(db, 'bank'), await listTransactions(db), '2026-10').balance, 250000);
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 88000);
  assert.equal(calculateFinanceSummary(await listAccounts(db), await listTransactions(db), '2026-10').monthlyIncome, 50000);
  await updateTransaction(db, 'cash-expense', record({ accountId: 'bank' }));
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 100000);
  assert.equal(calculateAccountSummary(await getAccount(db, 'bank'), await listTransactions(db), '2026-10').balance, 238000);
  await deleteTransaction(db, 'cash-expense');
  assert.equal(calculateAccountSummary(await getAccount(db, 'bank'), await listTransactions(db), '2026-10').balance, 250000);
  await saveAccount(db, { ...bank, archived: true }, false);
  assert.equal((await getAccount(db, 'bank')).archived, true);
  assert.equal((await listTransactions(db)).length, 1);
  await assert.rejects(createTransaction(db, 'blocked', record({ accountId: 'bank' })), /archived/);
  await assert.rejects(updateTransaction(db, 'bank-income', income()), /Unarchive/);
  await saveAccount(db, bank, false);
  await createTransaction(db, 'after-unarchive', record({ accountId: 'bank' }));
  assert.equal((await listTransactions(db)).length, 2);
});
test('unsafe account or transaction edits roll back and repeat IDs cannot overwrite other accounts', async (t) => {
  const { saveAccount, getAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  const { cash } = require('./fixtures.cjs');
  const db = await setup(t);
  const bank = { ...cash, id: 'bank', name: 'Bank', openingBalance: Number.MAX_SAFE_INTEGER };
  await saveAccount(db, bank, true);
  await createTransaction(db, 'cash-income', income());
  await assert.rejects(updateTransaction(db, 'cash-income', record({ accountId: 'bank', type: 'INCOME', category: 'Salary', amount: 1 })), /supported range/);
  assert.equal((await getTransaction(db, 'cash-income')).accountId, 'cash');
  await createTransaction(db, 'bank-expense', record({ accountId: 'bank', amount: 1 }));
  await assert.rejects(deleteTransaction(db, 'bank-expense').then(async () => {
    await createTransaction(db, 'overflow', record({ accountId: 'bank', type: 'INCOME', category: 'Salary', amount: 1 }));
  }), /supported range/);
  assert.equal(await getTransaction(db, 'overflow'), null);
  const retry = await createTransaction(db, 'cash-income', record({ accountId: 'bank' }));
  assert.equal(retry.accountId, 'cash');
  await assert.rejects(saveAccount(db, { ...bank, openingBalance: 1.5 }, false));
  assert.equal((await getAccount(db, 'bank')).openingBalance, Number.MAX_SAFE_INTEGER);
});
test('multi-account backups restore archived settings and records and survive atomic failure', async (t) => {
  const { saveAccount, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  const { cash } = require('./fixtures.cjs');
  const db = await setup(t);
  const bank = { ...cash, id: 'bank', name: 'Savings Bank', purpose: 'savings', includedInAvailable: false };
  await saveAccount(db, bank, true);
  await createTransaction(db, 'bank-record', record({ accountId: 'bank' }));
  await saveAccount(db, { ...bank, archived: true }, false);
  const backup = parseBackup(await readBackupJson(db));
  await restoreBackup(db, backup);
  assert.equal((await listAccounts(db)).length, 2);
  assert.deepEqual(await listAccounts(db), backup.accounts);
  assert.equal((await getTransaction(db, 'bank-record')).accountId, 'bank');
  const wrapped = { ...db, withExclusiveTransactionAsync: (operation) => db.withExclusiveTransactionAsync((transaction) => operation({
    ...transaction, runAsync: async (sql, ...params) => {
      if (sql.startsWith('INSERT INTO accounts') && params[0] === 'bank') throw new Error('Account insert failure');
      return transaction.runAsync(sql, ...params);
    },
  })) };
  await assert.rejects(restoreBackup(wrapped, backup), /Account insert failure/);
  assert.deepEqual(await listAccounts(db), backup.accounts);
  assert.equal((await getTransaction(db, 'bank-record')).amount, 12000);
});
test('balance corrections preserve openings, exclude reports, are idempotent and support deletion', async (t) => {
  const db = await setup(t);
  const { adjustAccountBalance } = require('../../.expo/finance-tests/storage/transactions.js');
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'spent', record({ amount: 38200 }));
  await adjustAccountBalance(db, 'adjust-up', 'cash', 80000, 61800);
  await adjustAccountBalance(db, 'adjust-up', 'cash', 80000, 61800);
  const up = await getTransaction(db, 'adjust-up');
  assert.equal(up.amount, 18200);
  assert.equal(up.adjustmentDirection, 'increase');
  assert.equal((await getCashAccount(db)).openingBalance, 100000);
  assert.deepEqual(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10'), {
    balance: 80000, monthlyIncome: 0, monthlyExpenses: 38200, hasNegativeBalance: false,
  });
  await assert.rejects(adjustAccountBalance(db, 'stale', 'cash', 90000, 61800), /changed/);
  await adjustAccountBalance(db, 'unchanged', 'cash', 80000, 80000);
  assert.equal(await getTransaction(db, 'unchanged'), null);
  await adjustAccountBalance(db, 'adjust-down', 'cash', -100, 80000);
  assert.equal((await getTransaction(db, 'adjust-down')).amount, 80100);
  assert.equal((await getTransaction(db, 'adjust-down')).adjustmentDirection, 'decrease');
  await assert.rejects(updateTransaction(db, 'adjust-down', expense()), /Adjust balance/);
  await deleteTransaction(db, 'adjust-down');
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 80000);
});

test('adjustment write failures roll back and archived accounts reject corrections', async (t) => {
  const db = await setup(t);
  const { adjustAccountBalance } = require('../../.expo/finance-tests/storage/transactions.js');
  const run = db.runAsync;
  db.runAsync = async (...args) => { const result = await run(...args); if(args[0].startsWith('INSERT INTO transactions')) throw new Error('write failure'); return result; };
  await assert.rejects(adjustAccountBalance(db, 'failed', 'cash', 100, 0), /write failure/);
  assert.equal(await getTransaction(db, 'failed'), null);
  db.runAsync = run;
  await db.runAsync('UPDATE accounts SET archived = 1 WHERE id = ?', 'cash');
  await assert.rejects(adjustAccountBalance(db, 'archived', 'cash', 100, 0), /Unarchive/);
  await assert.rejects(adjustAccountBalance(db, 'unsafe', 'cash', Number.MAX_SAFE_INTEGER + 1, 0), /safe integer/);
});

test('version 3 table migration preserves records and rolls back failures', async (t) => {
  const db = await setup(t);
  await createTransaction(db, 'kept', expense());
  await db.execAsync('PRAGMA user_version = 2');
  const exec = db.execAsync;
  db.execAsync = async (sql) => { await exec(sql); if(sql.includes('DROP TABLE transactions')) throw new Error('migration failure'); };
  await assert.rejects(initializeDatabase(db), /migration failure/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 2);
  assert.equal((await getTransaction(db, 'kept')).amount, 12000);
  db.execAsync = exec;
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
  assert.equal((await getTransaction(db, 'kept')).amount, 12000);
});

test('adjustments survive backup restore with direction and account balance intact', async (t) => {
  const db = await setup(t);
  const { adjustAccountBalance } = require('../../.expo/finance-tests/storage/transactions.js');
  const { serializeBackup, parseBackup } = require('../../.expo/finance-tests/backup.js');
  const { restoreBackup: restoreBackupRecords } = require('../../.expo/finance-tests/storage/backup.js');
  await adjustAccountBalance(db, 'correction', 'cash', 12345, 0);
  const backup = parseBackup(serializeBackup(await getCashAccount(db), await listTransactions(db)));
  await restoreBackupRecords(db, backup);
  assert.equal((await getTransaction(db, 'correction')).adjustmentDirection, 'increase');
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 12345);
});

test('transfers debit and credit exactly once and exclude financial reports', async (t) => {
  const db = await setup(t);
  const { saveAccount, listAccounts, getAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  const { calculateCurrentMoney, calculateFinanceSummary } = require('../../.expo/finance-tests/calculations.js');
  const { spendingByCategory, filterTransactions } = require('../../.expo/finance-tests/reporting.js');
  await updateOpeningBalance(db, 61800);
  await saveAccount(db, { ...await getCashAccount(db), id: 'savings', name: 'Savings', openingBalance: 0, purpose: 'savings', includedInAvailable: false }, true);
  const draft = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'savings', amount: 20000 });
  await Promise.all([createTransaction(db, 'transfer', draft), createTransaction(db, 'transfer', draft)]);
  let rows = await listTransactions(db);
  assert.equal(rows.length, 1);
  assert.equal(calculateAccountSummary(await getCashAccount(db), rows, '2026-10').balance, 41800);
  assert.equal(calculateAccountSummary(await getAccount(db, 'savings'), rows, '2026-10').balance, 20000);
  assert.deepEqual(calculateCurrentMoney(await listAccounts(db), rows), { totalMoney: 61800, availableMoney: 41800, hasNegativeAccount: false });
  assert.equal(calculateFinanceSummary(await listAccounts(db), rows, '2026-10').monthlyIncome, 0);
  assert.equal(calculateFinanceSummary(await listAccounts(db), rows, '2026-10').monthlyExpenses, 0);
  assert.deepEqual(spendingByCategory(rows, '2026-10'), []);
  assert.equal(filterTransactions(rows, '2026-10', 'TRANSFER').length, 1);
  await updateTransaction(db, 'transfer', { ...draft, accountId: 'savings', destinationAccountId: 'cash', amount: 500, transactionDate: '2026-09-30' });
  rows = await listTransactions(db);
  assert.equal(calculateAccountSummary(await getCashAccount(db), rows, '2026-10').balance, 62300);
  assert.equal(calculateAccountSummary(await getAccount(db, 'savings'), rows, '2026-10').balance, -500);
  assert.equal(filterTransactions(rows, '2026-09', 'TRANSFER').length, 1);
  await deleteTransaction(db, 'transfer');
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 61800);
});

test('transfer validation, overflow and failed writes preserve both balances', async (t) => {
  const db = await setup(t);
  const { saveAccount, getAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  await saveAccount(db, { ...await getCashAccount(db), id: 'bank', name: 'Bank', openingBalance: Number.MAX_SAFE_INTEGER }, true);
  const draft = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 1 });
  for (const patch of [{}, { destinationAccountId: 'cash' }, { destinationAccountId: 'missing' }, { destinationAccountId: undefined }, { amount: 0 }, { amount: 1.5 }]) {
    await assert.rejects(createTransaction(db, 'invalid', { ...draft, ...patch }));
    assert.equal(await getTransaction(db, 'invalid'), null);
  }
  await saveAccount(db, { ...await getAccount(db, 'bank'), openingBalance: 0 }, false);
  const run = db.runAsync;
  db.runAsync = async (...args) => { const result = await run(...args); if(args[0].startsWith('INSERT INTO transactions')) throw new Error('transfer failure'); return result; };
  await assert.rejects(createTransaction(db, 'failed-transfer', draft), /transfer failure/);
  db.runAsync = run;
  assert.equal((await listTransactions(db)).length, 0);
  await saveAccount(db, { ...await getAccount(db, 'bank'), archived: true }, false);
  await assert.rejects(createTransaction(db, 'archived-transfer', draft), /archived/);
});

test('transfer backups preserve both endpoints, restore atomically, and old payloads remain readable', async (t) => {
  const db = await setup(t);
  const { saveAccount, listAccounts, getAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  const { serializeBackup, parseBackup, previewBackup } = require('../../.expo/finance-tests/backup.js');
  const { restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  await saveAccount(db, { ...await getCashAccount(db), id: 'bank', name: 'Bank', openingBalance: 0 }, true);
  await createTransaction(db, 'transfer-backup', record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 123 }));
  const backup = parseBackup(serializeBackup(await listAccounts(db), await listTransactions(db)));
  assert.equal(backup.version, 6);
  assert.equal(previewBackup(backup).transferCount, 1);
  for (const version of [1, 2, 3]) assert.throws(() => parseBackup(JSON.stringify({ ...backup, version })));
  await restoreBackup(db, backup);
  const rows = await listTransactions(db);
  assert.equal(rows[0].destinationAccountId, 'bank');
  assert.equal(calculateAccountSummary(await getAccount(db, 'bank'), rows, '2026-10').balance, 123);
  const legacy = { ...backup, version: 3, transactions: [], goals: undefined, budgets: undefined };
  assert.equal(parseBackup(JSON.stringify(legacy)).version, 3);
});

test('version 4 migration preserves existing adjustment and expense records', async (t) => {
  const db = await setup(t);
  const { adjustAccountBalance } = require('../../.expo/finance-tests/storage/transactions.js');
  await createTransaction(db, 'expense-kept', expense());
  await adjustAccountBalance(db, 'adjustment-kept', 'cash', 100, -12000);
  await db.execAsync('PRAGMA user_version = 3');
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
  assert.equal((await getTransaction(db, 'adjustment-kept')).adjustmentDirection, 'increase');
  assert.equal((await getTransaction(db, 'expense-kept')).amount, 12000);
});

test('transfer edits clear the destination when converted and protect archived original endpoints', async (t) => {
  const db = await setup(t);
  const { saveAccount, getAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  await saveAccount(db, { ...await getCashAccount(db), id: 'bank', name: 'Bank', openingBalance: 0 }, true);
  const draft = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 100 });
  await createTransaction(db, 'editable-transfer', draft);
  await saveAccount(db, { ...await getAccount(db, 'bank'), archived: true }, false);
  await assert.rejects(updateTransaction(db, 'editable-transfer', expense()), /Unarchive/);
  assert.equal((await getTransaction(db, 'editable-transfer')).destinationAccountId, 'bank');
  await saveAccount(db, { ...await getAccount(db, 'bank'), archived: false }, false);
  await updateTransaction(db, 'editable-transfer', expense());
  assert.equal((await getTransaction(db, 'editable-transfer')).destinationAccountId, undefined);
  assert.equal(calculateAccountSummary(await getAccount(db, 'bank'), await listTransactions(db), '2026-10').balance, 0);
});

test('transfer records survive a disk restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kuwenta-transfer-'));
  const filename = join(directory, 'finance.db');
  const { saveAccount, getAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  let db = connect(filename);
  try {
    await initializeDatabase(db);
    await saveAccount(db, { ...await getCashAccount(db), id: 'bank', name: 'Bank', openingBalance: 0 }, true);
    await createTransaction(db, 'disk-transfer', record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 321 }));
    db.close(); db = connect(filename);
    await initializeDatabase(db);
    assert.equal((await getTransaction(db, 'disk-transfer')).destinationAccountId, 'bank');
    assert.equal(calculateAccountSummary(await getAccount(db, 'bank'), await listTransactions(db), '2026-10').balance, 321);
  } finally {
    db.close();
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});

test('version 4 migration failure rolls back the table and schema version', async (t) => {
  const db = await setup(t);
  await createTransaction(db, 'preserved', expense());
  await db.execAsync('PRAGMA user_version = 3');
  const exec = db.execAsync;
  db.execAsync = async (sql) => { await exec(sql); if(sql.includes('PRAGMA user_version = 4')) throw new Error('transfer migration failure'); };
  await assert.rejects(initializeDatabase(db), /transfer migration failure/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 3);
  assert.equal((await getTransaction(db, 'preserved')).amount, 12000);
});

const goalDraft = () => ({ id: 'emergency', name: 'Emergency fund', accountId: 'goal-savings', targetAmount: 50000, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z' });
async function addSavings(db, id = 'goal-savings') {
  const { saveAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  await saveAccount(db, { ...await getCashAccount(db), id, name: id, purpose: 'savings', openingBalance: 0, includedInAvailable: false }, true);
}
test('goal creation retries, editing and deletion preserve funds and enforce dedicated savings accounts', async (t) => {
  const db = await setup(t);
  const { saveGoal, listGoals, deleteGoal } = require('../../.expo/finance-tests/storage/goals.js');
  const { getAccount, saveAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  await addSavings(db);
  await Promise.all([saveGoal(db, goalDraft(), true), saveGoal(db, goalDraft(), true)]);
  assert.equal((await listGoals(db)).length, 1);
  await assert.rejects(saveGoal(db, { ...goalDraft(), id: 'second' }, true), /already has a goal/);
  await assert.rejects(saveGoal(db, { ...goalDraft(), accountId: 'cash' }, false), /savings account/);
  await saveGoal(db, { ...goalDraft(), name: 'Updated', targetAmount: 60000 }, false);
  assert.equal((await listGoals(db))[0].targetAmount, 60000);
  await createTransaction(db, 'fund-goal', record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'goal-savings', amount: 20000 }));
  const account = await getAccount(db, 'goal-savings');
  await assert.rejects(saveAccount(db, { ...account, purpose: 'spending' }, false), /goal/);
  await saveAccount(db, { ...account, archived: true }, false);
  assert.equal((await listGoals(db)).length, 1);
  await assert.rejects(saveGoal(db, goalDraft(), false), /Unarchive/);
  await deleteGoal(db, 'emergency');
  assert.equal((await listGoals(db)).length, 0);
  assert.equal(calculateAccountSummary(await getAccount(db, 'goal-savings'), await listTransactions(db), '2026-10').balance, 20000);
});

test('transfer purpose snapshots survive account changes and edits; changed endpoints capture new purposes', async (t) => {
  const db = await setup(t);
  const { saveAccount, getAccount, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const { calculateSavings } = require('../../.expo/finance-tests/calculations.js');
  await addSavings(db);
  const draft = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'goal-savings', amount: 20000 });
  await createTransaction(db, 'snapshot', draft);
  assert.equal((await getTransaction(db, 'snapshot')).sourcePurpose, 'spending');
  await saveAccount(db, { ...await getCashAccount(db), purpose: 'savings' }, false);
  assert.equal(calculateSavings(await listAccounts(db), await listTransactions(db), '2026-10').savedThisMonth, 20000);
  await updateTransaction(db, 'snapshot', { ...draft, amount: 10000, transactionDate: '2026-09-30' });
  assert.equal((await getTransaction(db, 'snapshot')).sourcePurpose, 'spending');
  assert.equal(calculateSavings(await listAccounts(db), await listTransactions(db), '2026-09').savedThisMonth, 10000);
  await updateTransaction(db, 'snapshot', { ...draft, accountId: 'goal-savings', destinationAccountId: 'cash' });
  assert.equal((await getTransaction(db, 'snapshot')).sourcePurpose, 'savings');
  assert.equal((await getTransaction(db, 'snapshot')).destinationPurpose, 'savings');
  assert.equal(calculateSavings(await listAccounts(db), await listTransactions(db), '2026-10').savedThisMonth, 0);
});

test('goal backups restore all records and roll back failure during goal insertion; legacy restore clears goals', async (t) => {
  const db = await setup(t);
  const { saveGoal, listGoals } = require('../../.expo/finance-tests/storage/goals.js');
  const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  await addSavings(db);
  await saveGoal(db, goalDraft(), true);
  await createTransaction(db, 'goal-transfer', record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'goal-savings', amount: 123 }));
  const backup = parseBackup(await readBackupJson(db));
  assert.equal(backup.goals.length, 1);
  const run = db.runAsync;
  db.runAsync = async (...args) => { const result = await run(...args); if(args[0].startsWith('INSERT INTO goals')) throw new Error('goal restore failure'); return result; };
  await assert.rejects(restoreBackup(db, backup), /goal restore failure/);
  assert.equal((await listGoals(db)).length, 1);
  assert.equal((await getTransaction(db, 'goal-transfer')).sourcePurpose, 'spending');
  db.runAsync = run;
  await restoreBackup(db, backup);
  assert.deepEqual(JSON.parse(JSON.stringify(await listGoals(db))), backup.goals);
  await restoreBackup(db, { ...backup, version: 4, goals: undefined, budgets: undefined, transactions: [] });
  assert.equal((await listGoals(db)).length, 0);
});

test('version 5 migration preserves legacy transfers and rolls back incomplete schema changes', async (t) => {
  const db = await setup(t);
  await addSavings(db);
  await createTransaction(db, 'legacy', record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'goal-savings' }));
  await db.execAsync('DROP TABLE goals; ALTER TABLE transactions DROP COLUMN sourcePurpose; ALTER TABLE transactions DROP COLUMN destinationPurpose; PRAGMA user_version = 4');
  const exec = db.execAsync;
  db.execAsync = async (sql) => { await exec(sql); if(sql.includes('PRAGMA user_version = 5')) throw new Error('goal migration failure'); };
  await assert.rejects(initializeDatabase(db), /goal migration failure/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 4);
  assert.equal((await db.getAllAsync('PRAGMA table_info(transactions)')).some((row) => row.name === 'sourcePurpose'), false);
  db.execAsync = exec;
  await initializeDatabase(db);
  assert.equal((await getTransaction(db, 'legacy')).destinationAccountId, 'goal-savings');
  assert.equal((await getTransaction(db, 'legacy')).sourcePurpose, undefined);
});

test('goals and transfer purposes survive a disk restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kuwenta-goals-'));
  const filename = join(directory, 'finance.db');
  const { saveGoal, listGoals } = require('../../.expo/finance-tests/storage/goals.js');
  let db = connect(filename);
  try {
    await initializeDatabase(db);
    await addSavings(db);
    await saveGoal(db, goalDraft(), true);
    await createTransaction(db, 'fund', record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'goal-savings' }));
    db.close(); db = connect(filename);
    await initializeDatabase(db);
    assert.equal((await listGoals(db))[0].name, 'Emergency fund');
    assert.equal((await getTransaction(db, 'fund')).destinationPurpose, 'savings');
  } finally {
    db.close();
    for(const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});

test('guided goal creation saves both records atomically, retries once, and rejects unintended financial accounts', async (t) => {
  const db = await setup(t);
  const { saveGoal, listGoals } = require('../../.expo/finance-tests/storage/goals.js');
  const { listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const account = { ...await getCashAccount(db), id: 'guided-account', name: 'Emergency Savings', purpose: 'savings', includedInAvailable: false };
  const goal = { ...goalDraft(), accountId: account.id };
  const run = db.runAsync;
  db.runAsync = async (...args) => { const result = await run(...args); if(args[0].startsWith('INSERT INTO goals')) throw new Error('guided save failure'); return result; };
  await assert.rejects(saveGoal(db, goal, true, account), /guided save failure/);
  assert.equal((await listAccounts(db)).length, 1);
  assert.equal((await listGoals(db)).length, 0);
  db.runAsync = run;
  await Promise.all([saveGoal(db, goal, true, account), saveGoal(db, goal, true, account)]);
  assert.equal((await listAccounts(db)).length, 2);
  assert.equal((await listGoals(db)).length, 1);
  const invalid = { ...account, id: 'invalid-guided', openingBalance: 100 };
  await assert.rejects(saveGoal(db, { ...goal, id: 'invalid-goal', accountId: invalid.id }, true, invalid), /zero/);
  assert.equal((await listAccounts(db)).length, 2);
});

test('last-used preference follows successful creation, rolls back failed saves, and clears on restore', async (t) => {
  const db = await setup(t);
  const { saveAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  const { restoreBackup, readBackupJson } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  await saveAccount(db, { ...await getCashAccount(db), id: 'bank-last', name: 'Bank' }, true);
  await createTransaction(db, 'bank-expense', record({ accountId: 'bank-last' }));
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'lastEntryAccount'")).value, 'bank-last');
  await assert.rejects(createTransaction(db, 'invalid-last', record({ amount: 0 })));
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'lastEntryAccount'")).value, 'bank-last');
  const backup = parseBackup(await readBackupJson(db));
  await restoreBackup(db, backup);
  assert.equal(await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'lastEntryAccount'"), null);
});

test('preferences migration preserves financial records and is repeatable', async (t) => {
  const db = await setup(t);
  await createTransaction(db, 'keep-six', expense());
  await db.execAsync('DROP TABLE preferences; PRAGMA user_version = 5');
  await initializeDatabase(db);
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
  assert.equal((await getTransaction(db, 'keep-six')).amount, 12000);
});


test('full reset removes financial records and preferences, starts with zero Cash, and is repeatable', async (t) => {
  const db = await setup(t);
  const { resetFinancialData } = require('../../.expo/finance-tests/storage/backup.js');
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'old', expense());
  await db.runAsync("INSERT INTO accounts VALUES ('saving', 'Savings', 'PHP', 50000, 'savings', 0, 1)");
  await db.runAsync("INSERT INTO goals VALUES ('goal', 'Goal', 'saving', 100000, NULL, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')");
  await resetFinancialData(db);
  await resetFinancialData(db);
  assert.equal((await getCashAccount(db)).openingBalance, 0);
  assert.equal((await getCashAccount(db)).archived, false);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM accounts')).n, 1);
  for (const table of ['transactions', 'goals']) assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM ' + table)).n, 0);
  await initializeDatabase(db);
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 0);
});

test('failed reset rolls back all deleted data and preferences', async (t) => {
  const db = await setup(t);
  const { resetFinancialData, readBackupJson } = require('../../.expo/finance-tests/storage/backup.js');
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'old', expense());
  const before = await readBackupJson(db);
  const run = db.runAsync;
  db.runAsync = async (sql, ...params) => {
    if (sql.startsWith('INSERT INTO accounts')) throw new Error('reset failure');
    return run(sql, ...params);
  };
  await assert.rejects(resetFinancialData(db), /reset failure/);
  db.runAsync = run;
  const after = await readBackupJson(db);
  assert.deepEqual(JSON.parse(after).accounts, JSON.parse(before).accounts);
  assert.deepEqual(JSON.parse(after).transactions, JSON.parse(before).transactions);
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'lastEntryAccount'")).value, 'cash');
});


test('Cash setup is atomic, exact, one-time, and excluded from income', async (t) => {
  const db = await setup(t);
  const { completeCashSetup } = require('../../.expo/finance-tests/storage/accounts.js');
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'cashSetupComplete'")).value, '0');
  await assert.rejects(completeCashSetup(db, -1));
  await assert.rejects(completeCashSetup(db, 1.5));
  const run = db.runAsync;
  db.runAsync = async (sql, ...params) => {
    if (sql.startsWith('UPDATE preferences')) throw new Error('setup failure');
    return run(sql, ...params);
  };
  await assert.rejects(completeCashSetup(db, 100050), /setup failure/);
  db.runAsync = run;
  assert.equal((await getCashAccount(db)).openingBalance, 0);
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'cashSetupComplete'")).value, '0');
  await completeCashSetup(db, 100050);
  await completeCashSetup(db, 500000);
  const summary = calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10');
  assert.equal(summary.balance, 100050);
  assert.equal(summary.monthlyIncome, 0);
  assert.equal((await listTransactions(db)).length, 0);
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'cashSetupComplete'")).value, '1');
});

test('legacy users skip setup, reset reopens it, and backup restore completes it', async (t) => {
  const db = await setup(t);
  const { completeCashSetup } = require('../../.expo/finance-tests/storage/accounts.js');
  const { resetFinancialData, restoreBackup, readBackupJson } = require('../../.expo/finance-tests/storage/backup.js');
  await updateOpeningBalance(db, 61800);
  await db.runAsync("DELETE FROM preferences WHERE key = 'cashSetupComplete'");
  await db.execAsync('PRAGMA user_version = 6');
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'cashSetupComplete'")).value, '1');
  await completeCashSetup(db, 0);
  assert.equal((await getCashAccount(db)).openingBalance, 61800);
  const backup = JSON.parse(await readBackupJson(db));
  await resetFinancialData(db);
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'cashSetupComplete'")).value, '0');
  await completeCashSetup(db, 0);
  assert.equal((await getCashAccount(db)).openingBalance, 0);
  await restoreBackup(db, backup);
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'cashSetupComplete'")).value, '1');
  assert.equal((await getCashAccount(db)).openingBalance, 61800);
});


test('delete only empty unused non-Cash accounts, including archived accounts', async (t) => {
  const db = await setup(t);
  const { deleteAccount, saveAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  const account = { id: 'unused', name: 'Unused', currency: 'PHP', openingBalance: 0, purpose: 'spending', includedInAvailable: true, archived: true };
  await saveAccount(db, account, true);
  await db.runAsync("INSERT INTO preferences(key, value) VALUES ('lastEntryAccount', 'unused')");
  await deleteAccount(db, account.id);
  await deleteAccount(db, account.id);
  assert.equal(await db.getFirstAsync('SELECT id FROM accounts WHERE id = ?', account.id), null);
  assert.equal(await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'lastEntryAccount'"), null);
  await assert.rejects(deleteAccount(db, 'cash'), /Cash account cannot/);
  await saveAccount(db, { ...account, id: 'funded', openingBalance: 100 }, true);
  await assert.rejects(deleteAccount(db, 'funded'), /balance/);
  await saveAccount(db, { ...account, id: 'negative', openingBalance: -100 }, true);
  await assert.rejects(deleteAccount(db, 'negative'), /balance/);
  await saveAccount(db, { ...account, id: 'linked', purpose: 'savings' }, true);
  await db.runAsync("INSERT INTO goals VALUES ('linked-goal', 'Goal', 'linked', 10000, NULL, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')");
  await assert.rejects(deleteAccount(db, 'linked'), /goal/);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM accounts')).n, 4);
});

test('account deletion preserves zero-net history and both transfer endpoints; failed deletion rolls back preferences', async (t) => {
  const db = await setup(t);
  const { deleteAccount, saveAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  const account = { id: 'history', name: 'History', currency: 'PHP', openingBalance: 0, purpose: 'spending', includedInAvailable: true, archived: false };
  await saveAccount(db, account, true);
  await createTransaction(db, 'in', { ...income(), accountId: 'history', amount: 12000 });
  await createTransaction(db, 'out', { ...expense(), accountId: 'history' });
  await assert.rejects(deleteAccount(db, 'history'), /history/);
  await saveAccount(db, { ...account, id: 'destination' }, true);
  await createTransaction(db, 'transfer', { ...expense(), type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'destination' });
  await assert.rejects(deleteAccount(db, 'destination'), /history/);
  await saveAccount(db, { ...account, id: 'empty' }, true);
  await db.runAsync("UPDATE preferences SET value = 'empty' WHERE key = 'lastEntryAccount'");
  const run = db.runAsync;
  db.runAsync = async (sql, ...params) => { if (sql.startsWith('DELETE FROM accounts')) throw new Error('delete failure'); return run(sql, ...params); };
  await assert.rejects(deleteAccount(db, 'empty'), /delete failure/);
  db.runAsync = run;
  assert.ok(await db.getFirstAsync("SELECT id FROM accounts WHERE id = 'empty'"));
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'lastEntryAccount'")).value, 'empty');
  assert.equal((await listTransactions(db)).length, 3);
});


test('budgets persist, copy only missing categories, recalculate expenses, and preserve transactions on deletion', async (t) => {
  const db = await setup(t);
  const { saveBudget, listBudgets, deleteBudget, copyPreviousBudgets } = require('../../.expo/finance-tests/storage/budgets.js');
  const { budgetReport } = require('../../.expo/finance-tests/budgets.js');
  const food = { month: '2026-09', category: 'Food', limitAmount: 500000 };
  await saveBudget(db, food, true);
  await saveBudget(db, food, true);
  await assert.rejects(saveBudget(db, { ...food, limitAmount: 600000 }, true), /already/);
  await saveBudget(db, { ...food, category: 'Bills', limitAmount: 100000 }, true);
  await saveBudget(db, { ...food, month: '2026-10', limitAmount: 700000 }, true);
  await copyPreviousBudgets(db, '2026-10');
  await copyPreviousBudgets(db, '2026-10');
  let rows = await listBudgets(db);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((row) => row.month === '2026-10' && row.category === 'Food').limitAmount, 700000);
  await createTransaction(db, 'budget-expense', expense());
  assert.equal(budgetReport(rows, await listTransactions(db), '2026-10').budgetedSpent, 12000);
  await updateTransaction(db, 'budget-expense', { ...expense(), amount: 13000 });
  assert.equal(budgetReport(rows, await listTransactions(db), '2026-10').budgetedSpent, 13000);
  await updateTransaction(db, 'budget-expense', { ...expense(), transactionDate: '2026-09-30' });
  assert.equal(budgetReport(rows, await listTransactions(db), '2026-10').budgetedSpent, 0);
  await saveBudget(db, { ...food, limitAmount: 600000 }, false);
  await deleteBudget(db, food.month, food.category);
  assert.equal((await listTransactions(db)).length, 1);
  await initializeDatabase(db);
  assert.equal((await listBudgets(db)).length, 3);
});

test('budget backup and reset support atomic replacement and old payloads', async (t) => {
  const db = await setup(t);
  const { saveBudget, listBudgets } = require('../../.expo/finance-tests/storage/budgets.js');
  const { readBackupJson, restoreBackup, resetFinancialData } = require('../../.expo/finance-tests/storage/backup.js');
  const budget = { month: '2026-10', category: 'Food', limitAmount: 500000 };
  await saveBudget(db, budget, true);
  const backup = JSON.parse(await readBackupJson(db));
  assert.deepEqual(backup.budgets, [budget]);
  const run = db.runAsync;
  db.runAsync = async (sql, ...params) => { if (sql.startsWith('INSERT INTO budgets')) throw new Error('budget restore failure'); return run(sql, ...params); };
  await assert.rejects(restoreBackup(db, backup), /budget restore failure/);
  db.runAsync = run;
  assert.deepEqual(await listBudgets(db), [budget]);
  await resetFinancialData(db);
  assert.deepEqual(await listBudgets(db), []);
  await restoreBackup(db, backup);
  assert.deepEqual(await listBudgets(db), [budget]);
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  await restoreBackup(db, parseBackup(JSON.stringify({ ...backup, version: 5, budgets: undefined })));
  assert.deepEqual(await listBudgets(db), []);
});

test('budget schema migration preserves records and rolls back errors', async (t) => {
  const db = await setup(t);
  await createTransaction(db, 'before-budget', expense());
  await db.execAsync('DROP TABLE budgets; PRAGMA user_version = 7');
  const exec = db.execAsync;
  db.execAsync = async (sql) => { await exec(sql); if (sql.includes('CREATE TABLE IF NOT EXISTS budgets')) throw new Error('budget migration failure'); };
  await assert.rejects(initializeDatabase(db), /budget migration failure/);
  db.execAsync = exec;
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 7);
  assert.equal((await listTransactions(db)).length, 1);
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 8);
});


test('copying budgets is atomic and deletion recalculates spending', async (t) => {
  const db = await setup(t);
  const { saveBudget, listBudgets, copyPreviousBudgets } = require('../../.expo/finance-tests/storage/budgets.js');
  const { budgetReport } = require('../../.expo/finance-tests/budgets.js');
  const food = { month: '2026-09', category: 'Food', limitAmount: 500000 };
  await saveBudget(db, food, true);
  await saveBudget(db, { ...food, category: 'Bills' }, true);
  const run = db.runAsync;
  let inserts = 0;
  db.runAsync = async (sql, ...params) => { const result = await run(sql, ...params); if (sql.startsWith('INSERT INTO budgets') && ++inserts === 2) throw new Error('copy failure'); return result; };
  await assert.rejects(copyPreviousBudgets(db, '2026-10'), /copy failure/);
  db.runAsync = run;
  assert.equal((await listBudgets(db)).filter((row) => row.month === '2026-10').length, 0);
  await copyPreviousBudgets(db, '2026-10');
  await createTransaction(db, 'delete-budget-expense', expense());
  await deleteTransaction(db, 'delete-budget-expense');
  assert.equal(budgetReport(await listBudgets(db), await listTransactions(db), '2026-10').budgetedSpent, 0);
});


test('onboarding saves optional name and Cash atomically and never overwrites existing users', async (t) => {
  const db = await setup(t);
  const { completeCashSetup } = require('../../.expo/finance-tests/storage/accounts.js');
  const { resetFinancialData, restoreBackup, readBackupJson } = require('../../.expo/finance-tests/storage/backup.js');
  await assert.rejects(completeCashSetup(db, 100000, 'a'.repeat(51)));
  const run = db.runAsync;
  db.runAsync = async (sql, ...params) => { if (sql.startsWith('UPDATE preferences')) throw new Error('onboarding failure'); return run(sql, ...params); };
  await assert.rejects(completeCashSetup(db, 100000, 'Ana'), /onboarding failure/);
  db.runAsync = run;
  assert.equal((await getCashAccount(db)).openingBalance, 0);
  assert.equal(await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'"), null);
  await completeCashSetup(db, 100000, ' Ana ');
  await completeCashSetup(db, 500000, 'Other');
  assert.equal((await getCashAccount(db)).openingBalance, 100000);
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'")).value, 'Ana');
  const backup = JSON.parse(await readBackupJson(db));
  assert.equal(backup.displayName, undefined);
  await restoreBackup(db, backup);
  assert.equal(await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'"), null);
  await resetFinancialData(db);
  await completeCashSetup(db, 0, '');
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'")).value, '');
});
