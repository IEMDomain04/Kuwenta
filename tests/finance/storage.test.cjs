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
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 17);
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
  await db.execAsync('PRAGMA user_version = 18');
  await assert.rejects(initializeDatabase(db), /newer version/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 18);
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
  record({ id: 'restored-expense', notes: 'Lunch ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±120', updatedAt: '2026-10-09T07:00:00.000Z' }),
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
    (v) => { v.version = 12; },
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
  await db.runAsync("INSERT INTO accounts(id, name, currency, openingBalance, purpose, includedInAvailable, archived) VALUES ('other', 'Other', 'PHP', 0, 'spending', 1, 0)");
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
    assert.equal((await getTransaction(db, 'restored-expense')).notes, 'Lunch ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±120');
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
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 17);
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
  await assert.rejects(updateTransaction(db, 'adjust-down', expense()), /Edit account/);
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
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 17);
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
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 17);
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
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 17);
  assert.equal((await getTransaction(db, 'keep-six')).amount, 12000);
});


test('full reset removes financial records and preferences, starts with zero Cash, and is repeatable', async (t) => {
  const db = await setup(t);
  const { resetFinancialData } = require('../../.expo/finance-tests/storage/backup.js');
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'old', expense());
  await db.runAsync("INSERT INTO accounts(id, name, currency, openingBalance, purpose, includedInAvailable, archived) VALUES ('saving', 'Savings', 'PHP', 50000, 'savings', 0, 1)");
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


test('active and archived accounts can be deleted with their opening balances and linked goals', async t => {
  const db = await setup(t);
  const { deleteAccount, saveAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  const account = { id: 'mistake', name: 'Mistake', currency: 'PHP', openingBalance: 50000, purpose: 'savings', includedInAvailable: false, archived: false };
  for (const archived of [false, true]) {
    await saveAccount(db, { ...account, archived }, true);
    await db.runAsync("INSERT INTO goals VALUES ('linked-goal', 'Goal', 'mistake', 100000, NULL, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')");
    await db.runAsync("INSERT OR REPLACE INTO preferences(key, value) VALUES ('lastEntryAccount', 'mistake')");
    await db.runAsync("INSERT OR REPLACE INTO preferences(key, value) VALUES ('accountOrder', '[\"mistake\",\"cash\"]')");
    await deleteAccount(db, account.id);
    await deleteAccount(db, account.id);
    assert.equal(await db.getFirstAsync('SELECT id FROM accounts WHERE id = ?', account.id), null);
    assert.equal(await db.getFirstAsync("SELECT id FROM goals WHERE accountId = 'mistake'"), null);
    assert.equal(await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'lastEntryAccount'"), null);
    assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'accountOrder'")).value, '["cash"]');
  }
  await saveAccount(db, { ...account, openingBalance: -50000 }, true);
  await deleteAccount(db, account.id);
  await assert.rejects(deleteAccount(db, 'cash'), /Cash account cannot/);
  assert.equal((await db.getFirstAsync('SELECT count(*) AS n FROM accounts')).n, 1);
});

test('account deletion removes related activity and transfers, recalculates other balances, and keeps unrelated records', async t => {
  const db = await setup(t);
  const { deleteAccount, saveAccount, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const { calculateCurrentMoney } = require('../../.expo/finance-tests/calculations.js');
  const { readBackupJson } = require('../../.expo/finance-tests/storage/backup.js');
  await updateOpeningBalance(db, 100000);
  const bank = { id: 'bank', name: 'Bank', currency: 'PHP', openingBalance: 50000, purpose: 'spending', includedInAvailable: true, archived: false };
  await saveAccount(db, bank, true);
  await createTransaction(db, 'bank-in', { ...income(), accountId: 'bank', amount: 12000 });
  await createTransaction(db, 'bank-out', { ...expense(), accountId: 'bank' });
  await createTransaction(db, 'to-bank', { ...expense(), type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 10000 });
  await createTransaction(db, 'from-bank', { ...expense(), accountId: 'bank', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'cash', amount: 3000 });
  await createTransaction(db, 'unrelated', { ...income(), amount: 1000 });
  await db.runAsync("INSERT INTO transactions (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, adjustmentDirection, externalName) VALUES ('external', 'bank', 'EXTERNAL', 1000, 'External transfer', '2026-10-09', '00:00:00', NULL, '2026-10-09T00:00:00.000Z', '2026-10-09T00:00:00.000Z', 'increase', 'Friend')");
  await deleteAccount(db, 'bank');
  assert.deepEqual((await listTransactions(db)).map(row => row.id), ['unrelated']);
  const summary = calculateCurrentMoney(await listAccounts(db), await listTransactions(db));
  assert.equal(summary.totalMoney, 101000);
  assert.equal(summary.availableMoney, 101000);
  assert.equal(JSON.parse(await readBackupJson(db)).accounts.length, 1);
  assert.equal((await db.getAllAsync('PRAGMA foreign_key_check')).length, 0);
});

test('failed account deletion rolls back financial records, goals and preferences together', async t => {
  const db = await setup(t);
  const { deleteAccount, saveAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  await saveAccount(db, { id: 'bank', name: 'Bank', currency: 'PHP', openingBalance: 50000, purpose: 'savings', includedInAvailable: false, archived: false }, true);
  await createTransaction(db, 'bank-out', { ...expense(), accountId: 'bank' });
  await db.runAsync("INSERT INTO goals VALUES ('goal', 'Goal', 'bank', 100000, NULL, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')");
  await db.runAsync("INSERT OR REPLACE INTO preferences VALUES ('lastEntryAccount', 'bank'), ('accountOrder', '[\"bank\",\"cash\"]')");
  const run = db.runAsync;
  db.runAsync = async (sql, ...params) => { if (sql.startsWith('DELETE FROM accounts')) throw new Error('delete failure'); return run(sql, ...params); };
  await assert.rejects(deleteAccount(db, 'bank'), /delete failure/);
  db.runAsync = run;
  assert.ok(await db.getFirstAsync("SELECT id FROM accounts WHERE id = 'bank'"));
  assert.ok(await db.getFirstAsync("SELECT id FROM goals WHERE id = 'goal'"));
  assert.equal((await listTransactions(db)).length, 1);
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'lastEntryAccount'")).value, 'bank');
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'accountOrder'")).value, '["bank","cash"]');
});

test('deleting a transfer account rolls back if it would overflow the remaining account balance', async t => {
  const db = await setup(t);
  const { deleteAccount, saveAccount } = require('../../.expo/finance-tests/storage/accounts.js');
  const account = { id: 'bank', name: 'Bank', currency: 'PHP', openingBalance: Number.MAX_SAFE_INTEGER, purpose: 'spending', includedInAvailable: true, archived: false };
  await saveAccount(db, account, true);
  await saveAccount(db, { ...account, id: 'offset', openingBalance: -Number.MAX_SAFE_INTEGER }, true);
  await createTransaction(db, 'transfer', { ...expense(), accountId: 'bank', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'offset', amount: 1000 });
  await createTransaction(db, 'income', { ...income(), accountId: 'bank', amount: 1, transactionTime: '14:34:00' });
  await assert.rejects(deleteAccount(db, 'offset'), /supported|safe|range/);
  assert.ok(await db.getFirstAsync("SELECT id FROM accounts WHERE id = 'offset'"));
  assert.equal((await listTransactions(db)).length, 2);
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
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 17);
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
  await assert.rejects(completeCashSetup(db, 100000, 'Ana', '   '));
  const run = db.runAsync;
  db.runAsync = async (sql, ...params) => { if (sql.startsWith('UPDATE preferences')) throw new Error('onboarding failure'); return run(sql, ...params); };
  await assert.rejects(completeCashSetup(db, 100000, 'Ana', 'Pocket Money'), /onboarding failure/);
  db.runAsync = run;
  assert.equal((await getCashAccount(db)).openingBalance, 0);
  assert.equal(await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'"), null);
  assert.equal((await getCashAccount(db)).name, 'Cash');
  await completeCashSetup(db, 100000, ' Ana ', ' Pocket Money ');
  await completeCashSetup(db, 500000, 'Other');
  assert.equal((await getCashAccount(db)).openingBalance, 100000);
  assert.equal((await getCashAccount(db)).name, 'Pocket Money');
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'")).value, 'Ana');
  const backup = JSON.parse(await readBackupJson(db));
  assert.equal(backup.displayName, undefined);
  await restoreBackup(db, backup);
  assert.equal(await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'"), null);
  await resetFinancialData(db);
  await completeCashSetup(db, 0, '');
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'")).value, '');
});

test('external movements persist exactly once, exclude reports and History, and survive backup restore', async (t) => {
  const db = await setup(t);
  const { createExternalTransfer } = require('../../.expo/finance-tests/storage/transactions.js');
  const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  const { filterTransactions } = require('../../.expo/finance-tests/reporting.js');
  const incoming = record({ id: 'external-in', type: 'EXTERNAL', category: 'External transfer', externalName: 'Untracked wallet', adjustmentDirection: 'increase', amount: 10000 });
  await createExternalTransfer(db, incoming.id, incoming);
  await createExternalTransfer(db, incoming.id, incoming);
  const outgoing = { ...incoming, id: 'external-out', adjustmentDirection: 'decrease', amount: 3000 };
  await createExternalTransfer(db, outgoing.id, outgoing);
  let rows = await listTransactions(db);
  assert.equal(rows.length, 2);
  let summary = calculateAccountSummary(await getCashAccount(db), rows, '2026-10');
  assert.equal(summary.balance, 7000);
  assert.equal(summary.monthlyIncome, 0);
  assert.equal(summary.monthlyExpenses, 0);
  assert.equal(filterTransactions(rows, '2026-10', 'ALL').length, 0);
  const backup = parseBackup(await readBackupJson(db));
  assert.equal(backup.version, 7);
  await restoreBackup(db, backup);
  assert.equal((await listTransactions(db))[0].externalName, 'Untracked wallet');
  await deleteTransaction(db, 'external-out');
  assert.equal(calculateAccountSummary(await getCashAccount(db), await listTransactions(db), '2026-10').balance, 10000);
  await assert.rejects(() => createExternalTransfer(db, 'invalid', { ...incoming, id: 'invalid', externalName: '' }));
});

test('profile name edits persist, reject invalid input and preserve financial records', async (t) => {
  const db = await setup(t);
  const { saveDisplayName } = require('../../.expo/finance-tests/storage/accounts.js');
  const before = await getCashAccount(db);
  await saveDisplayName(db, ' Emman ');
  await saveDisplayName(db, ' Ana ');
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'")).value, 'Ana');
  for (const invalid of ['', '   ', 'a'.repeat(51), 'Ana\n']) await assert.rejects(saveDisplayName(db, invalid));
  assert.equal((await db.getFirstAsync("SELECT value FROM preferences WHERE key = 'displayName'")).value, 'Ana');
  assert.deepEqual(await getCashAccount(db), before);
  assert.equal((await listTransactions(db)).length, 0);
});

test('account display order survives restart without changing balances or records', async () => {
  const { saveAccount, saveAccountOrder, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const directory = mkdtempSync(join(tmpdir(), 'kuwenta-order-'));
  const filename = join(directory, 'finance.db');
  let db = connect(filename);
  try {
    await initializeDatabase(db);
    const cash = await getCashAccount(db);
    await saveAccount(db, { ...cash, id: 'bank', name: 'Bank', openingBalance: 10000 }, true);
    await createTransaction(db, 'expense', expense());
    const before = await listTransactions(db);
    await saveAccountOrder(db, ['bank', 'cash']);
    db.close(); db = connect(filename);
    const accounts = await listAccounts(db);
    assert.deepEqual(accounts.map(account => account.id), ['bank', 'cash']);
    assert.equal(accounts[0].openingBalance, 10000);
    assert.deepEqual(await listTransactions(db), before);
    await saveAccount(db, { ...cash, id: 'new', name: 'Another account' }, true);
    assert.deepEqual((await listAccounts(db)).map(account => account.id), ['bank', 'cash', 'new']);
    await db.runAsync("DELETE FROM accounts WHERE id = 'bank'");
    assert.deepEqual((await listAccounts(db)).map(account => account.id), ['cash', 'new']);
  } finally {
    db.close();
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});

test('invalid account order is rejected and broken stored preferences do not hide accounts', async t => {
  const { saveAccount, saveAccountOrder, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const db = await setup(t);
  await saveAccount(db, { ...await getCashAccount(db), id: 'bank', name: 'Bank' }, true);
  await saveAccountOrder(db, ['bank', 'cash']);
  for (const ids of [[], ['bank'], ['cash', 'cash'], ['cash', 'missing']]) await assert.rejects(saveAccountOrder(db, ids), /Accounts changed/);
  assert.deepEqual((await listAccounts(db)).map(account => account.id), ['bank', 'cash']);
  for (const value of ['invalid JSON', '{}', '[42]']) {
    await db.runAsync("UPDATE preferences SET value = ? WHERE key = 'accountOrder'", value);
    assert.deepEqual((await listAccounts(db)).map(account => account.id), ['cash', 'bank']);
  }
});


test('account colors persist through edits, restart, export and replacement restore without changing balances', async () => {
  const { saveAccount, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  const directory = mkdtempSync(join(tmpdir(), 'kuwenta-colors-'));
  const filename = join(directory, 'finance.db');
  let db = connect(filename);
  try {
    await initializeDatabase(db);
    const account = { ...(await getCashAccount(db)), id: 'bank', name: 'Bank', openingBalance: 450050, color: 'teal' };
    await saveAccount(db, account, true);
    await createTransaction(db, 'expense', { ...expense(), accountId: 'bank', amount: 5050 });
    await saveAccount(db, { ...account, color: 'plum' }, false);
    db.close(); db = connect(filename);
    await initializeDatabase(db);
    assert.equal((await listAccounts(db)).find(row => row.id === 'bank').color, 'plum');
    const backup = parseBackup(await readBackupJson(db));
    assert.equal(backup.version, 8);
    await restoreBackup(db, backup);
    const restored = (await listAccounts(db)).find(row => row.id === 'bank');
    assert.equal(restored.color, 'plum');
    assert.equal(calculateAccountSummary(restored, await listTransactions(db), '2026-10').balance, 445000);
    await assert.rejects(saveAccount(db, { ...restored, color: '#FFFFFF' }, false), /valid account color/);
    assert.equal((await listAccounts(db)).find(row => row.id === 'bank').color, 'plum');
    await saveAccount(db, { ...restored, color: undefined }, false);
    assert.equal((await listAccounts(db)).find(row => row.id === 'bank').color, undefined);
  } finally {
    db.close();
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});

test('version 9 account color migration preserves existing records and rolls back failed upgrades', async t => {
  const db = await setup(t);
  await updateOpeningBalance(db, 100000);
  await createTransaction(db, 'expense', expense());
  await db.execAsync('ALTER TABLE accounts DROP COLUMN color; PRAGMA user_version = 9;');
  const exec = db.execAsync;
  db.execAsync = async sql => { await exec(sql); if (sql.includes('ADD COLUMN color')) throw new Error('color migration failed'); };
  await assert.rejects(initializeDatabase(db), /color migration failed/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 9);
  assert.ok(!(await db.getAllAsync('PRAGMA table_info(accounts)')).some(row => row.name === 'color'));
  assert.equal((await getTransaction(db, 'expense')).amount, 12000);
  db.execAsync = exec;
  await initializeDatabase(db);
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 17);
  assert.equal((await getCashAccount(db)).openingBalance, 100000);
  assert.equal((await getCashAccount(db)).color, undefined);
});


test('JSON and Excel backups restore the same records into real SQLite', async t => {
 const db = await setup(t);
 const { cash } = require('./fixtures.cjs');
 const { serializeBackup, parseBackup } = require('../../.expo/finance-tests/backup.js');
 const { createExcelBackup, parseExcelBackup } = require('../../.expo/finance-tests/excel-backup.js');
 const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
 const stamp = '2026-10-12T00:00:00.000Z';
 const saving = { ...cash, id: 'save', name: 'Savings', purpose: 'savings', includedInAvailable: false, openingBalance: 0, color: 'green' };
 const original = parseBackup(serializeBackup([cash, saving], [
  record({ id: 'expense', category: 'Groceries', amount: 6025 }),
  record({ id: 'transfer', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 20000, sourcePurpose: 'spending', destinationPurpose: 'savings' }),
  record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', externalName: 'Parent', adjustmentDirection: 'increase', amount: 10000 }),
 ], stamp, [{ id: 'goal', name: 'Laptop', accountId: 'save', targetAmount: 100000, createdAt: stamp, updatedAt: stamp }], [{ month: '2026-10', category: 'Groceries', limitAmount: 20000 }]));
 function normalize(backup) {
  return { ...backup, exportedAt: stamp, accounts: [...backup.accounts].sort((a,b) => a.id.localeCompare(b.id)), transactions: [...backup.transactions].sort((a,b) => a.id.localeCompare(b.id)) };
 }
 for (const backup of [original, parseExcelBackup(createExcelBackup(original))]) {
  await restoreBackup(db, backup);
  assert.deepEqual(normalize(parseBackup(await readBackupJson(db))), normalize(original));
 }
});


test('budget ordering persists without changing amounts, rejects stale orders and tolerates deleted categories', async () => {
  const { saveBudget, saveBudgetOrder, listBudgets, deleteBudget } = require('../../.expo/finance-tests/storage/budgets.js');
  const directory = mkdtempSync(join(tmpdir(), 'kuwenta-budget-order-'));
  const filename = join(directory, 'finance.db');
  let db = connect(filename);
  try {
    await initializeDatabase(db);
    for (const category of ['Meals','Snacks']) await saveBudget(db, {month:'2026-10',category,limitAmount:10000},true);
    await saveBudget(db, {month:'2026-09',category:'Meals',limitAmount:5000},true);
    await saveBudgetOrder(db, '2026-10', ['Snacks','Meals']);
    db.close(); db = connect(filename);
    assert.deepEqual((await listBudgets(db)).map(row=>[row.month,row.category,row.limitAmount]), [['2026-09','Meals',5000],['2026-10','Snacks',10000],['2026-10','Meals',10000]]);
    await assert.rejects(saveBudgetOrder(db,'2026-10',['Meals','Meals']));
    await assert.rejects(saveBudgetOrder(db,'2026-10',['Meals']));
    await saveBudget(db, {month:'2026-10',category:'Groceries',limitAmount:100},true);
    assert.deepEqual((await listBudgets(db)).filter(row=>row.month==='2026-10').map(row=>row.category), ['Snacks','Meals','Groceries']);
    await deleteBudget(db,'2026-10','Snacks');
    assert.deepEqual((await listBudgets(db)).filter(row=>row.month==='2026-10').map(row=>row.category), ['Meals','Groceries']);
    await db.runAsync("UPDATE preferences SET value = 'broken' WHERE key = 'budgetOrder'");
    assert.equal((await listBudgets(db)).length,3);
    assert.equal((await listTransactions(db)).length,0);
  } finally {
    db.close(); for (const name of readdirSync(directory)) unlinkSync(join(directory,name)); rmdirSync(directory);
  }
});


test('Home visualization selections persist, support none, and never change financial records', async () => {
  const { loadHomeVisualizations, saveHomeVisualizations } = require('../../.expo/finance-tests/home-visualizations.js');
  const directory = mkdtempSync(join(tmpdir(), 'kuwenta-home-options-'));
  const filename = join(directory, 'finance.db'); let db = connect(filename);
  try {
    await initializeDatabase(db);
    await createTransaction(db,'expense',expense());
    assert.deepEqual(await loadHomeVisualizations(db), ['activity','summary','categories','budgets']);
    await saveHomeVisualizations(db,['balances']);
    db.close(); db=connect(filename);
    assert.deepEqual(await loadHomeVisualizations(db),['balances']);
    await saveHomeVisualizations(db,['categories','activity']);
    db.close(); db=connect(filename);
    assert.deepEqual(await loadHomeVisualizations(db),['activity','categories']);
    await assert.rejects(saveHomeVisualizations(db,['unknown']));
    await assert.rejects(saveHomeVisualizations(db,['activity','activity']));
    assert.deepEqual(await loadHomeVisualizations(db),['activity','categories']);
    await saveHomeVisualizations(db,[]);
    db.close(); db=connect(filename);
    assert.deepEqual(await loadHomeVisualizations(db),[]);
    assert.equal((await listTransactions(db)).length,1);
    await db.runAsync("UPDATE preferences SET value = 'broken' WHERE key = 'homeVisualizations'");
    assert.deepEqual(await loadHomeVisualizations(db), ['activity','summary','categories','budgets']);
  } finally { db.close(); for (const name of readdirSync(directory)) unlinkSync(join(directory,name)); rmdirSync(directory); }
});


test('every account palette choice survives JSON and Excel replacement restore', async t => {
  const { ACCOUNT_CARD_COLORS } = require('../../.expo/finance-tests/account-colors.js');
  const { saveAccount, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  const { createExcelBackup, parseExcelBackup } = require('../../.expo/finance-tests/excel-backup.js');
  const db=await setup(t); const cash=await getCashAccount(db);
  for(const color of Object.keys(ACCOUNT_CARD_COLORS)) await saveAccount(db,{...cash,id:'color-'+color,name:color,color,openingBalance:10000},true);
  const backup=parseBackup(await readBackupJson(db));
  for(const payload of [backup,parseExcelBackup(createExcelBackup(backup))]) {
    await restoreBackup(db,payload);
    const accounts=await listAccounts(db);
    for(const color of Object.keys(ACCOUNT_CARD_COLORS)) assert.equal(accounts.find(row=>row.id==='color-'+color).color,color);
  }
});


test('version 10 palette upgrade preserves foreign keys and rolls back an interrupted migration', async t => {
  const {saveAccount,listAccounts}=require('../../.expo/finance-tests/storage/accounts.js');
  const db=await setup(t);
  await saveAccount(db,{...await getCashAccount(db),id:'bank',name:'Bank',purpose:'savings',includedInAvailable:false,color:'teal',openingBalance:50000},true);
  await createTransaction(db,'old-expense',{...expense(),accountId:'bank'});
  await db.runAsync("INSERT INTO goals VALUES ('goal','Target','bank',100000,NULL,'2026-10-09T06:35:00.000Z','2026-10-09T06:35:00.000Z')");
  await db.execAsync("ALTER TABLE accounts DROP COLUMN color; ALTER TABLE accounts ADD COLUMN color TEXT CHECK(color IS NULL OR color IN ('green','blue','teal','plum','amber')); UPDATE accounts SET color = 'teal' WHERE id = 'bank'; PRAGMA user_version = 10;");
  const exec=db.execAsync;
  db.execAsync=async sql=>{await exec(sql);if(sql.includes('RENAME COLUMN color'))throw new Error('Interrupted palette upgrade');};
  await assert.rejects(initializeDatabase(db),/Interrupted palette upgrade/);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,10);
  assert.equal((await listAccounts(db)).find(row=>row.id==='bank').color,'teal');
  assert.ok(!(await db.getAllAsync('PRAGMA table_info(accounts)')).some(row=>row.name==='previousColor'));
  db.execAsync=exec;
  await initializeDatabase(db);
  assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,17);
  const bank=(await listAccounts(db)).find(row=>row.id==='bank');
  assert.equal(bank.color,'teal');
  assert.equal(calculateAccountSummary(bank,await listTransactions(db),'2026-10').balance,38000);
  assert.equal((await db.getFirstAsync("SELECT accountId FROM goals WHERE id = 'goal'")).accountId,'bank');
  assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'),[]);
  await saveAccount(db,{...bank,color:'cyan'},false);
  await initializeDatabase(db);
  assert.equal((await listAccounts(db)).find(row=>row.id==='bank').color,'cyan');
});


test('icon migration preserves monthly records and rolls back on failure; all periods persist and restore', async t => {
 const db=await setup(t);
 const {saveAccount,listAccounts}=require('../../.expo/finance-tests/storage/accounts.js');
 const {saveBudget,listBudgets,saveBudgetOrder}=require('../../.expo/finance-tests/storage/budgets.js');
 const {migrateDatabase}=require('../../.expo/finance-tests/storage/migrations.js');
 const {readBackupJson,restoreBackup}=require('../../.expo/finance-tests/storage/backup.js');
 const {parseBackup}=require('../../.expo/finance-tests/backup.js');
 const monthly={month:'2026-10',category:'Meals',limitAmount:10000};
 await saveBudget(db,monthly,true);
 await db.execAsync('ALTER TABLE accounts DROP COLUMN icon; PRAGMA user_version = 11;');
 const exec=db.execAsync;
 db.execAsync=async sql=>{await exec(sql);if(sql.includes('ADD COLUMN icon'))throw new Error('interrupted icon migration');};
 await assert.rejects(()=>migrateDatabase(db),/interrupted/);
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,11);
 assert.deepEqual(await listBudgets(db),[monthly]);
 db.execAsync=exec;await migrateDatabase(db);
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,17);
 const cash=await getCashAccount(db);await saveAccount(db,{...cash,icon:'gcash'},false);
 for(const month of ['daily:2026-10-13','weekly:2026-10-12']){
  await saveBudget(db,{...monthly,month},true);
  await assert.rejects(()=>saveBudget(db,{...monthly,month,limitAmount:20000},true),/already has/);
  await saveBudgetOrder(db,month,['Meals']);
 }
 const backup=parseBackup(await readBackupJson(db));
 await restoreBackup(db,backup);
 assert.deepEqual((await listAccounts(db)).map(a=>a.icon),['gcash']);
 assert.equal((await listBudgets(db)).length,3);
 assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'),[]);
});


test('moving a budget is atomic, rejects occupied periods, and preserves transaction records',async t=>{
 const db=await setup(t);
 const {saveBudget,listBudgets,deleteBudget}=require('../../.expo/finance-tests/storage/budgets.js');
 const original={month:'2026-10',category:'Meals',limitAmount:10000};
 const target={...original,month:'weekly:2026-10-12',limitAmount:12000};
 await saveBudget(db,original,true);await saveBudget(db,target,true);
 await createTransaction(db,'kept-expense',expense());
 await assert.rejects(()=>saveBudget(db,target,false,original),/already has/);
 assert.equal((await listBudgets(db)).length,2);
 await deleteBudget(db,target.month,target.category);
 const run=db.runAsync;db.runAsync=async(...args)=>{await run(...args);if(args[0].startsWith('UPDATE budgets SET month'))throw new Error('interrupted move');};
 await assert.rejects(()=>saveBudget(db,target,false,original),/interrupted/);
 assert.deepEqual(await listBudgets(db),[original]);
 db.runAsync=run;await saveBudget(db,target,false,original);
 assert.deepEqual(await listBudgets(db),[target]);
 assert.equal((await listTransactions(db)).length,1);
 await assert.rejects(()=>saveBudget(db,{...target,month:'daily:2026-10-13'},false,original),/no longer exists/);
 assert.deepEqual(await listBudgets(db),[target]);
});


test('exchanges save, edit, export, restore and delete their linked records atomically',async t=>{
 const db=await setup(t);const {saveAccount}=require('../../.expo/finance-tests/storage/accounts.js');
 const {exchangeDraft}=require('../../.expo/finance-tests/exchanges.js');const {calculateFinanceSummary}=require('../../.expo/finance-tests/calculations.js');
 const {readBackupJson,restoreBackup}=require('../../.expo/finance-tests/storage/backup.js');const {parseBackup}=require('../../.expo/finance-tests/backup.js');
 const {createExcelBackup,parseExcelBackup}=require('../../.expo/finance-tests/excel-backup.js');
 await updateOpeningBalance(db,500000);const cash=await getCashAccount(db);await saveAccount(db,{...cash,id:'bank',name:'Bank',openingBalance:500000},true);
 const draft=(paid,received)=>exchangeDraft('bank',{kind:'Service sale',paid,received,receivedAccountId:'cash',extraAccountId:'bank',earningsConfirmed:false},'2026-10-13','12:00:00');
 await createTransaction(db,'sale',draft(9500,10000));await createTransaction(db,'sale',draft(9500,10000));
 assert.equal((await listTransactions(db)).length,2);
 const run=db.runAsync;db.runAsync=async(...args)=>{const result=await run(...args);if(args[0].includes('INSERT INTO transactions')&&args[1]==='sale:extra')throw new Error('second record failed');return result;};
 await assert.rejects(()=>updateTransaction(db,'sale',draft(9000,10000)),/failed/);
 assert.equal((await getTransaction(db,'sale')).amount,9500);db.runAsync=run;
 await updateTransaction(db,'sale',draft(9000,10000));
 assert.equal((await getTransaction(db,'sale')).amount,9000);
 const backup=parseBackup(await readBackupJson(db));assert.equal(backup.version,11);
 const excel=parseExcelBackup(createExcelBackup(backup));assert.deepEqual(excel,backup);
 await restoreBackup(db,excel);assert.equal((await listTransactions(db)).length,2);
 const accounts=await require('../../.expo/finance-tests/storage/accounts.js').listAccounts(db);
 const report=calculateFinanceSummary(accounts,await listTransactions(db),'2026-10');assert.equal(report.monthlyIncome,1000);assert.equal(report.monthlyExpenses,0);
 await deleteTransaction(db,'sale:extra');assert.equal((await listTransactions(db)).length,0);
 assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'),[]);
});


test('exchange migration rolls back and receiver account deletion removes the whole service sale',async t=>{
 const db=await setup(t);await createTransaction(db,'old',expense());
 await db.execAsync('DROP INDEX transactions_exchange_parent; ALTER TABLE transactions DROP COLUMN exchangeParentId; ALTER TABLE transactions DROP COLUMN exchange; PRAGMA user_version = 12;');
 const exec=db.execAsync;db.execAsync=async sql=>{await exec(sql);if(sql.includes('ADD COLUMN exchange TEXT'))throw new Error('migration interrupted');};
 await assert.rejects(()=>initializeDatabase(db),/interrupted/);assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,12);
 assert.equal((await listTransactions(db)).length,1);db.execAsync=exec;await initializeDatabase(db);
 const {saveAccount,deleteAccount}=require('../../.expo/finance-tests/storage/accounts.js');const cash=await getCashAccount(db);
 await saveAccount(db,{...cash,id:'receiver',name:'Receiver'},true);
 const draft=require('../../.expo/finance-tests/exchanges.js').exchangeDraft('cash',{kind:'Service sale',paid:9500,received:10000,receivedAccountId:'receiver',extraAccountId:'cash',earningsConfirmed:false},'2026-10-13','12:00:00');
 await createTransaction(db,'sale',draft);await deleteAccount(db,'receiver');
 assert.equal(await getTransaction(db,'sale'),null);assert.equal((await listTransactions(db)).length,1);
});


test('account details and current balance edits are atomic, preserve opening history and restore from backups',async()=>{
 const {saveAccountWithBalance}=require('../../.expo/finance-tests/storage/transactions.js');
 const {listAccounts}=require('../../.expo/finance-tests/storage/accounts.js');
 const {readBackupJson,restoreBackup}=require('../../.expo/finance-tests/storage/backup.js');
 const {parseBackup}=require('../../.expo/finance-tests/backup.js');
 const db=connect();await initializeDatabase(db);await updateOpeningBalance(db,100000);
 await createTransaction(db,'before',expense());const original=await getCashAccount(db);
 const expected=calculateAccountSummary(original,await listTransactions(db),'1900-01').balance;
 await assert.rejects(saveAccountWithBalance(db,{...original,name:'Wrong'},{id:'stale',target:50000,expected:expected+1}),/balance changed/);
 assert.equal((await getCashAccount(db)).name,original.name);assert.equal((await listTransactions(db)).length,1);
 await assert.rejects(saveAccountWithBalance(db,{...original,name:'Wrong',openingBalance:200000},{id:'wrong',target:50000,expected}),/starting balance/);
 const update={...original,name:'My cash',color:'teal'};
 await saveAccountWithBalance(db,update,{id:'edit-balance',target:50000,expected});
 await saveAccountWithBalance(db,update,{id:'edit-balance',target:50000,expected});
 assert.equal((await getCashAccount(db)).openingBalance,100000);assert.equal((await getCashAccount(db)).name,'My cash');
 assert.equal((await listTransactions(db)).length,2);assert.equal(calculateAccountSummary(await getCashAccount(db),await listTransactions(db),'1900-01').balance,50000);
 const backup=parseBackup(await readBackupJson(db));await restoreBackup(db,backup);
 assert.equal(calculateAccountSummary((await listAccounts(db))[0],await listTransactions(db),'1900-01').balance,50000);
 db.close();
});


test('version 14 converts old service pairs atomically, preserves balances and supports old JSON and Excel backups',async t=>{
 const db=await setup(t);
 const {saveAccount,listAccounts}=require('../../.expo/finance-tests/storage/accounts.js');
 const {calculateFinanceSummary}=require('../../.expo/finance-tests/calculations.js');
 const {parseBackup}=require('../../.expo/finance-tests/backup.js');
 const {createExcelBackup,parseExcelBackup}=require('../../.expo/finance-tests/excel-backup.js');
 const {restoreBackup}=require('../../.expo/finance-tests/storage/backup.js');
 await updateOpeningBalance(db,500000);const cash=await getCashAccount(db);
 await saveAccount(db,{...cash,id:'bank',name:'MariBank',purpose:'savings',includedInAvailable:false},true);
 const old={type:'EXPENSE',category:'Service sale',accountId:'bank',amount:9500,transactionDate:'2026-10-13',transactionTime:'12:00:00',exchange:{kind:'Service sale',paid:9500,received:10000,receivedAccountId:'cash',extraAccountId:'bank',earningsConfirmed:false}};
 await createTransaction(db,'legacy-sale',old);
 const original=await listTransactions(db);const accounts=await listAccounts(db);
 const legacyJson=JSON.stringify({format:'kuwenta-finance',version:10,currency:'PHP',timezone:'Asia/Manila',exportedAt:'2026-10-13T04:00:00.000Z',accounts,transactions:original,goals:[],budgets:[]});
 const before=accounts.map(account=>calculateAccountSummary(account,original,'1900-01').balance);
 await db.execAsync('PRAGMA user_version = 13');
 const run=db.runAsync;db.runAsync=async(...args)=>{const value=await run(...args);if(args[0].startsWith('UPDATE transactions SET type'))throw new Error('migration interrupted');return value;};
 await assert.rejects(initializeDatabase(db),/interrupted/);db.runAsync=run;
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,13);assert.equal((await getTransaction(db,'legacy-sale')).type,'EXPENSE');
 await initializeDatabase(db);await initializeDatabase(db);
 const converted=await listTransactions(db);assert.equal((await getTransaction(db,'legacy-sale')).type,'TRANSFER');
 assert.deepEqual(accounts.map(account=>calculateAccountSummary(account,converted,'1900-01').balance),before);
 assert.equal(calculateFinanceSummary(accounts,converted,'2026-10').monthlyIncome,500);
 assert.equal(calculateFinanceSummary(accounts,converted,'2026-10').monthlyExpenses,0);
 for(const backup of [parseBackup(legacyJson),parseExcelBackup(createExcelBackup(parseBackup(legacyJson)))]){
  await restoreBackup(db,backup);const restored=await listTransactions(db);
  assert.deepEqual(accounts.map(account=>calculateAccountSummary(account,restored,'1900-01').balance),before);
  assert.equal(calculateFinanceSummary(accounts,restored,'2026-10').monthlyIncome,500);
 }
 await updateTransaction(db,'legacy-sale',require('../../.expo/finance-tests/exchanges.js').exchangeDraft('bank',{...old.exchange,paid:9000},old.transactionDate,old.transactionTime));
 assert.equal(calculateFinanceSummary(accounts,await listTransactions(db),'2026-10').monthlyIncome,1000);
 await deleteTransaction(db,'legacy-sale:extra');assert.equal((await listTransactions(db)).length,0);
});


test('external edits retain identity, recalculate both accounts and stay outside reports and backups history', async t => {
  const db = await setup(t);
  const { createExternalTransfer, updateExternalTransfer } = require('../../.expo/finance-tests/storage/transactions.js');
  const { saveAccountDetails, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const { calculateFinanceSummary } = require('../../.expo/finance-tests/calculations.js');
  const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  const { filterTransactions } = require('../../.expo/finance-tests/reporting.js');
  await saveAccountDetails(db, { id: 'bank', name: 'Bank', currency: 'PHP', openingBalance: 50000, purpose: 'savings', includedInAvailable: false, archived: false }, true);
  const original = record({ id: 'external-edit', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'increase', amount: 10000 });
  await createExternalTransfer(db, original.id, original);
  const initial = await getTransaction(db, original.id);
  await updateExternalTransfer(db, original.id, { ...original, accountId: 'bank', amount: 3000, adjustmentDirection: 'decrease', externalName: 'Parent', notes: 'Corrected', transactionDate: '2026-10-10' });
  const saved = await getTransaction(db, original.id);
  assert.equal(saved.createdAt, original.createdAt); assert.equal(saved.type, 'EXTERNAL'); assert.equal(saved.externalName, 'Parent'); assert.equal(saved.notes, 'Corrected');
  const accounts = await listAccounts(db), rows = await listTransactions(db);
  assert.equal(rows.length, 1);
  assert.equal(calculateAccountSummary(accounts.find(row => row.id === 'cash'), rows, '2026-10').balance, 0);
  assert.equal(calculateAccountSummary(accounts.find(row => row.id === 'bank'), rows, '2026-10').balance, 47000);
  const totals = calculateFinanceSummary(accounts, rows, '2026-10');
  assert.equal(totals.monthlyIncome, 0); assert.equal(totals.monthlyExpenses, 0); assert.equal(filterTransactions(rows, '2026-10').length, 0);
  const backup = parseBackup(await readBackupJson(db));
  await restoreBackup(db, backup);
  const { createExcelBackup, parseExcelBackup } = require('../../.expo/finance-tests/excel-backup.js');
  await restoreBackup(db, parseExcelBackup(createExcelBackup(backup)));
  assert.deepEqual(await getTransaction(db, original.id), saved);
  await deleteTransaction(db, original.id);
  assert.equal(calculateAccountSummary(accounts.find(row => row.id === 'bank'), await listTransactions(db), '2026-10').balance, 50000);
});
test('external edits reject archived accounts, wrong types, missing IDs and invalid fields without altering records', async t => {
  const db = await setup(t);
  const { createExternalTransfer, updateExternalTransfer } = require('../../.expo/finance-tests/storage/transactions.js');
  const { saveAccountDetails } = require('../../.expo/finance-tests/storage/accounts.js');
  const archived = { id: 'old', name: 'Old', currency: 'PHP', openingBalance: 0, purpose: 'spending', includedInAvailable: true, archived: true };
  await saveAccountDetails(db, { ...archived, archived: false }, true); await saveAccountDetails(db, archived, false);
  const original = record({ id: 'external-check', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'increase' });
  await createExternalTransfer(db, original.id, original);
  const initial = await getTransaction(db, original.id);
  for (const change of [{ accountId: 'old' }, { amount: -100 }, { externalName: '' }, { transactionDate: 'bad' }, { type: 'INCOME', category: 'Salary' }]) await assert.rejects(() => updateExternalTransfer(db, original.id, { ...original, ...change }));
  await assert.rejects(() => updateExternalTransfer(db, 'missing', { ...original, id: 'missing' }), /no longer available/);
  const cash = await getCashAccount(db); await saveAccountDetails(db, { ...cash, archived: true }, false);
  await assert.rejects(() => updateExternalTransfer(db, original.id, { ...original, amount: 2000 }), /Unarchive the original/);
  assert.deepEqual(await getTransaction(db, original.id), initial);
  await deleteTransaction(db, original.id); // Deletion remains available for an archived account.
  assert.equal(await getTransaction(db, original.id), null);
});
test('an external edit that overflows a balance rolls back atomically', async t => {
  const db = await setup(t);
  const { createExternalTransfer, updateExternalTransfer } = require('../../.expo/finance-tests/storage/transactions.js');
  const { saveAccountDetails } = require('../../.expo/finance-tests/storage/accounts.js');
  await saveAccountDetails(db, { id: 'full', name: 'Full', currency: 'PHP', openingBalance: Number.MAX_SAFE_INTEGER, purpose: 'spending', includedInAvailable: true, archived: false }, true);
  const original = record({ id: 'external-overflow', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'increase', amount: 1 });
  await createExternalTransfer(db, original.id, original);
  const initial = await getTransaction(db, original.id);
  await assert.rejects(() => updateExternalTransfer(db, original.id, { ...original, accountId: 'full' }), /supported range/);
  assert.deepEqual(await getTransaction(db, original.id), initial);
});


test('overall budgets create, edit, reorder with categories, restore JSON and Excel, and delete without affecting records', async t => {
  const { OVERALL_BUDGET, mergeBudgetOrder, budgetReport } = require('../../.expo/finance-tests/budgets.js');
  const { saveBudget, listBudgets, saveBudgetOrder, deleteBudget } = require('../../.expo/finance-tests/storage/budgets.js');
  const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
  const { parseBackup } = require('../../.expo/finance-tests/backup.js');
  const { createExcelBackup, parseExcelBackup } = require('../../.expo/finance-tests/excel-backup.js');
  const db = await setup(t);
  await createTransaction(db, 'meal', { ...expense(), category: 'Meals' });
  const originalRows = await listTransactions(db);
  const overall = { month: '2026-10', category: OVERALL_BUDGET, limitAmount: 50000 };
  await saveBudget(db, overall, true);
  await saveBudget(db, { ...overall, category: 'Meals', limitAmount: 20000 }, true);
  await saveBudget(db, { ...overall, category: 'Transport', limitAmount: 10000 }, true);
  await assert.rejects(saveBudget(db, { ...overall, limitAmount: 60000 }, true), /already/);
  await saveBudget(db, { ...overall, limitAmount: 55000 }, false);
  const ordered = mergeBudgetOrder((await listBudgets(db)).map(row => row.category), ['Transport', 'Meals']);
  await saveBudgetOrder(db, overall.month, ordered);
  const saved = await listBudgets(db);
  assert.equal(budgetReport(saved, originalRows, overall.month).totalLimit, 55000);
  const backup = parseBackup(await readBackupJson(db));
  await restoreBackup(db, backup);
  assert.deepEqual((await listBudgets(db)).sort((a, b) => a.category.localeCompare(b.category)), [...saved].sort((a, b) => a.category.localeCompare(b.category)));
  await restoreBackup(db, parseExcelBackup(createExcelBackup(backup)));
  assert.deepEqual((await listBudgets(db)).sort((a, b) => a.category.localeCompare(b.category)), [...saved].sort((a, b) => a.category.localeCompare(b.category)));
  await deleteBudget(db, overall.month, OVERALL_BUDGET);
  assert.equal((await listBudgets(db)).length, 2);
  assert.deepEqual(await listTransactions(db), originalRows);
});


const debtStore = require('../../.expo/finance-tests/storage/debts.js');
const debtMath = require('../../.expo/finance-tests/debts.js');
const sampleDebt = (overrides={}) => ({ id:'loan',name:'Classmate',kind:'owed',amount:50000,accountId:'cash',transactionDate:'2026-10-19',transactionTime:'10:00:00',createdAt:'2026-10-19T02:00:00.000Z',updatedAt:'2026-10-19T02:00:00.000Z',...overrides });
const samplePayment = (overrides={}) => ({ id:'repayment',debtId:'loan',accountId:'cash',amount:20000,transactionDate:'2026-10-20',transactionTime:'10:00:00',createdAt:'2026-10-20T02:00:00.000Z',...overrides });

test('lending, partial repayment and settlement update cash without counting principal as income or expense',async t=>{
 const db=await setup(t);await updateOpeningBalance(db,100000);
 await debtStore.createDebt(db,sampleDebt());await debtStore.createDebt(db,sampleDebt());
 let rows=await listTransactions(db),cash=await getCashAccount(db);
 assert.equal(rows.length,1);assert.equal(calculateAccountSummary(cash,rows,'2026-10').balance,50000);
 assert.deepEqual(debtMath.debtTotals(await debtStore.listDebts(db),[]),{owe:0,owed:50000});
 await debtStore.recordDebtPayment(db,samplePayment());await debtStore.recordDebtPayment(db,samplePayment());
 assert.equal((await listTransactions(db)).length,2);
 let progress=debtMath.debtProgress(sampleDebt(),await debtStore.listDebtPayments(db));
 assert.equal(progress.remaining,30000);
 assert.equal(calculateAccountSummary(cash,await listTransactions(db),'2026-10').balance,70000);
 await debtStore.recordDebtPayment(db,samplePayment({id:'last',amount:30000}));
 progress=debtMath.debtProgress(sampleDebt(),await debtStore.listDebtPayments(db));assert.equal(progress.settled,true);
 const summary=calculateAccountSummary(cash,await listTransactions(db),'2026-10');
 assert.equal(summary.balance,100000);assert.equal(summary.monthlyIncome,0);assert.equal(summary.monthlyExpenses,0);
 assert.equal(require('../../.expo/finance-tests/budgets.js').budgetReport([{month:'2026-10',category:'Overall spending',limitAmount:100000}],await listTransactions(db),'2026-10').budgetedSpent,0);
});

test('borrowing and repayment from another account preserve report totals and reverse correctly on deletion',async t=>{
 const db=await setup(t);const cash=await getCashAccount(db);
 const {saveAccountDetails,listAccounts}=require('../../.expo/finance-tests/storage/accounts.js');
 await saveAccountDetails(db,{...cash,id:'bank',name:'Bank',openingBalance:40000},true);
 await debtStore.createDebt(db,sampleDebt({kind:'owe'}));
 await debtStore.recordDebtPayment(db,samplePayment({accountId:'bank'}));
 assert.equal(calculateAccountSummary(cash,await listTransactions(db),'2026-10').balance,50000);
 assert.equal(calculateAccountSummary((await listAccounts(db)).find(a=>a.id==='bank'),await listTransactions(db),'2026-10').balance,20000);
 assert.equal(debtMath.debtTotals(await debtStore.listDebts(db),await debtStore.listDebtPayments(db)).owe,30000);
 await debtStore.removeDebtRecord(db,'repayment',true);
 assert.equal(debtMath.debtProgress(sampleDebt(),await debtStore.listDebtPayments(db)).remaining,50000);
 await debtStore.recordDebtPayment(db,samplePayment({accountId:'bank'}));
 await debtStore.removeDebtRecord(db,'loan');
 assert.equal((await debtStore.listDebts(db)).length,0);assert.equal((await listTransactions(db)).length,0);
 assert.equal(calculateAccountSummary(cash,await listTransactions(db),'2026-10').balance,0);
});

test('invalid debt records, excessive or early repayments, archived accounts and conflicting IDs never change balances',async t=>{
 const db=await setup(t);await debtStore.createDebt(db,sampleDebt());
 const before=await listTransactions(db);
 for(const payment of [samplePayment({amount:50001}),samplePayment({amount:0}),samplePayment({transactionDate:'2026-10-18'}),samplePayment({debtId:'missing'}),samplePayment({accountId:'unknown'}),samplePayment({id:'loan'})])await assert.rejects(debtStore.recordDebtPayment(db,payment));
 await assert.rejects(debtStore.createDebt(db,sampleDebt({amount:90000})),/already/);
 for(const debt of [sampleDebt({id:'new',name:''}),sampleDebt({id:'new',kind:'bad'}),sampleDebt({id:'new',dueDate:'2026-10-18'}),sampleDebt({id:'new',amount:-1})])await assert.rejects(debtStore.createDebt(db,debt));
 const {saveAccount}=require('../../.expo/finance-tests/storage/accounts.js');await saveAccount(db,{...await getCashAccount(db),archived:true},false);
 await assert.rejects(debtStore.recordDebtPayment(db,samplePayment()),/active/);
 assert.deepEqual(await listTransactions(db),before);
});

test('linked debt movements cannot be changed separately or removed by deleting their account',async t=>{
 const db=await setup(t);const {saveAccountDetails,deleteAccount}=require('../../.expo/finance-tests/storage/accounts.js');
 await saveAccountDetails(db,{...await getCashAccount(db),id:'bank',name:'Bank'},true);
 await debtStore.createDebt(db,sampleDebt({accountId:'bank'}));
 await debtStore.recordDebtPayment(db,samplePayment({accountId:'bank'}));
 await assert.rejects(deleteTransaction(db,'loan'),/Debts/);
 await assert.rejects(deleteTransaction(db,'repayment'),/Debts/);
 const {updateExternalTransfer}=require('../../.expo/finance-tests/storage/transactions.js');
 await assert.rejects(updateExternalTransfer(db,'loan',{...await getTransaction(db,'loan'),amount:1}),/Debts/);
 await assert.rejects(deleteAccount(db,'bank'),/debt records/);
 assert.equal((await listTransactions(db)).length,2);
});

test('debt writes and deletes roll back atomically when a balance would overflow',async t=>{
 const db=await setup(t);await updateOpeningBalance(db,Number.MAX_SAFE_INTEGER);
 await assert.rejects(debtStore.createDebt(db,sampleDebt({kind:'owe'})),/supported range/);
 assert.equal((await listTransactions(db)).length,0);assert.equal((await debtStore.listDebts(db)).length,0);
 await debtStore.createDebt(db,sampleDebt());
 await createTransaction(db,'extra',{...expense(),type:'INCOME',category:'Salary',amount:50000});
 await assert.rejects(debtStore.removeDebtRecord(db,'loan'),/supported range/);
 assert.equal((await debtStore.listDebts(db)).length,1);assert.equal((await listTransactions(db)).length,2);
});

test('debt JSON and Excel replacement backups retain linked records and reject broken links before restoring',async t=>{
 const db=await setup(t);await debtStore.createDebt(db,sampleDebt({dueDate:'2026-11-01',notes:'School allowance'}));
 await debtStore.recordDebtPayment(db,samplePayment({notes:'Partial return'}));
 const {readBackupJson,restoreBackup,resetFinancialData}=require('../../.expo/finance-tests/storage/backup.js');
 const {parseBackup,previewBackup}=require('../../.expo/finance-tests/backup.js');
 const {createExcelBackup,parseExcelBackup}=require('../../.expo/finance-tests/excel-backup.js');
 const backup=parseBackup(await readBackupJson(db));assert.equal(backup.version,12);assert.equal(previewBackup(backup).debtCount,1);
 const workbook=parseExcelBackup(createExcelBackup(backup));assert.deepEqual(workbook,backup);
 await resetFinancialData(db);assert.equal((await debtStore.listDebts(db)).length,0);
 await restoreBackup(db,workbook);assert.equal((await debtStore.listDebtPayments(db)).length,1);
 assert.equal(debtMath.debtTotals(await debtStore.listDebts(db),await debtStore.listDebtPayments(db)).owed,30000);
 for(const broken of [{...backup,transactions:backup.transactions.filter(row=>row.id!=='repayment')},{...backup,debtPayments:[{...backup.debtPayments[0],amount:99999}]},{...backup,version:11},{...backup,debts:undefined}])await assert.rejects(restoreBackup(db,broken));
 assert.equal((await debtStore.listDebtPayments(db)).length,1);
});

test('version 15 debt migration preserves existing activity and rolls back an interrupted upgrade',async t=>{
 const db=await setup(t);await createTransaction(db,'meal',expense());
 const before=await listTransactions(db);
 await db.execAsync('DROP TABLE debt_payments; DROP TABLE debts; PRAGMA user_version = 14;');
 const exec=db.execAsync;db.execAsync=async sql=>{await exec(sql);if(sql.includes('CREATE TABLE IF NOT EXISTS debts'))throw new Error('migration interrupted');};
 await assert.rejects(initializeDatabase(db),/interrupted/);
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,14);
 assert.equal(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'debts'"),null);
 db.execAsync=exec;await initializeDatabase(db);
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,17);assert.deepEqual(await listTransactions(db),before);
});


test('existing debts track what is owed without moving balances, while real repayments still move money',async t=>{
 const db=await setup(t);await updateOpeningBalance(db,70000);
 const {calculateCurrentMoney}=require('../../.expo/finance-tests/calculations.js');
 const {listAccounts}=require('../../.expo/finance-tests/storage/accounts.js');
 const debt=sampleDebt({existing:true,accountId:undefined});
 await debtStore.createDebt(db,debt);await debtStore.createDebt(db,debt);
 assert.equal((await listTransactions(db)).length,0);assert.equal((await debtStore.listDebts(db))[0].existing,true);
 assert.equal(calculateCurrentMoney(await listAccounts(db),await listTransactions(db)).availableMoney,70000);
 assert.equal(debtMath.debtTotals(await debtStore.listDebts(db),[]).owed,50000);
 await debtStore.recordDebtPayment(db,samplePayment());
 let summary=calculateAccountSummary(await getCashAccount(db),await listTransactions(db),'2026-10');
 assert.equal(summary.balance,90000);assert.equal(summary.monthlyIncome,0);assert.equal(summary.monthlyExpenses,0);
 assert.equal(debtMath.debtTotals(await debtStore.listDebts(db),await debtStore.listDebtPayments(db)).owed,30000);
 await assert.rejects(debtStore.recordDebtPayment(db,samplePayment({id:'excess',amount:30001})),/exceed/);
 await debtStore.removeDebtRecord(db,'repayment',true);
 assert.equal(calculateAccountSummary(await getCashAccount(db),await listTransactions(db),'2026-10').balance,70000);
 await debtStore.recordDebtPayment(db,samplePayment());await debtStore.removeDebtRecord(db,'loan');
 assert.equal((await listTransactions(db)).length,0);assert.equal(calculateAccountSummary(await getCashAccount(db),[], '2026-10').balance,70000);
});

test('existing money owed by the user does not add cash and repayments reduce the actual selected account',async t=>{
 const db=await setup(t);await updateOpeningBalance(db,70000);
 await debtStore.createDebt(db,sampleDebt({kind:'owe',existing:true,accountId:undefined}));
 assert.equal((await listTransactions(db)).length,0);
 await debtStore.recordDebtPayment(db,samplePayment());
 const summary=calculateAccountSummary(await getCashAccount(db),await listTransactions(db),'2026-10');
 assert.equal(summary.balance,50000);assert.equal(summary.monthlyExpenses,0);
 assert.equal(debtMath.debtTotals(await debtStore.listDebts(db),await debtStore.listDebtPayments(db)).owe,30000);
 await debtStore.removeDebtRecord(db,'loan');assert.equal((await listTransactions(db)).length,0);
});

test('tracking-only debts reject accounts, invalid mode flags and invented initial movements',async t=>{
 const db=await setup(t);
 for(const debt of [sampleDebt({existing:true}),sampleDebt({existing:'yes',accountId:undefined}),sampleDebt({accountId:undefined})])await assert.rejects(debtStore.createDebt(db,debt));
 const valid=sampleDebt({existing:true,accountId:undefined});await debtStore.createDebt(db,valid);
 await assert.rejects(debtStore.createDebt(db,{...valid,existing:undefined,accountId:'cash'}),/already/);
 const accounts=[await getCashAccount(db)];
 assert.throws(()=>debtMath.validateDebtRecords([valid],[],accounts,[{...debtMath.debtMovement(sampleDebt())}]),/initial money movement/);
 assert.equal((await listTransactions(db)).length,0);
});

test('existing debts and repayments round trip through JSON and Excel without inventing a loan balance movement',async t=>{
 const db=await setup(t);await updateOpeningBalance(db,70000);
 await debtStore.createDebt(db,sampleDebt({existing:true,accountId:undefined,notes:'Still owed from last week'}));
 await debtStore.recordDebtPayment(db,samplePayment());
 const {readBackupJson,restoreBackup}=require('../../.expo/finance-tests/storage/backup.js');
 const {parseBackup}=require('../../.expo/finance-tests/backup.js');
 const {createExcelBackup,parseExcelBackup}=require('../../.expo/finance-tests/excel-backup.js');
 const backup=parseBackup(await readBackupJson(db));assert.equal(backup.version,13);assert.equal(backup.debts[0].accountId,undefined);
 const excel=parseExcelBackup(createExcelBackup(backup));assert.deepEqual(excel,backup);
 for(const payload of [backup,excel]){
  await restoreBackup(db,payload);
  assert.equal((await listTransactions(db)).length,1);assert.equal((await debtStore.listDebts(db))[0].existing,true);
  assert.equal(calculateAccountSummary(await getCashAccount(db),await listTransactions(db),'2026-10').balance,90000);
 }
 await assert.rejects(restoreBackup(db,{...backup,version:12}),/version 13/);
 await assert.rejects(restoreBackup(db,{...backup,debts:[{...backup.debts[0],existing:undefined}]}));
 assert.equal((await listTransactions(db)).length,1);
});

test('version 16 preserves old linked debts and repayments and rolls back an interrupted upgrade',async t=>{
 const db=await setup(t);await debtStore.createDebt(db,sampleDebt());await debtStore.recordDebtPayment(db,samplePayment());
 const rows=await listTransactions(db);
 await db.execAsync(`
  CREATE TABLE old_debts(id TEXT PRIMARY KEY REFERENCES transactions(id),name TEXT NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL,accountId TEXT NOT NULL REFERENCES accounts(id),transactionDate TEXT NOT NULL,transactionTime TEXT NOT NULL,dueDate TEXT,notes TEXT,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
  INSERT INTO old_debts SELECT id,name,kind,amount,accountId,transactionDate,transactionTime,dueDate,notes,createdAt,updatedAt FROM debts;
  CREATE TABLE old_payments(id TEXT PRIMARY KEY REFERENCES transactions(id),debtId TEXT NOT NULL REFERENCES old_debts(id),accountId TEXT NOT NULL REFERENCES accounts(id),amount INTEGER NOT NULL,transactionDate TEXT NOT NULL,transactionTime TEXT NOT NULL,notes TEXT,createdAt TEXT NOT NULL);
  INSERT INTO old_payments SELECT * FROM debt_payments;
  DROP TABLE debt_payments; DROP TABLE debts;
  ALTER TABLE old_debts RENAME TO debts; ALTER TABLE old_payments RENAME TO debt_payments;
  CREATE INDEX debt_payments_debt ON debt_payments(debtId); PRAGMA user_version = 15;
 `);
 const exec=db.execAsync;db.execAsync=async sql=>{await exec(sql);if(sql.includes('CREATE TABLE debts_new'))throw new Error('migration interrupted');};
 await assert.rejects(initializeDatabase(db),/interrupted/);
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,15);assert.deepEqual(await listTransactions(db),rows);
 db.execAsync=exec;await initializeDatabase(db);
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,17);assert.deepEqual(await listTransactions(db),rows);
 assert.equal((await debtStore.listDebts(db))[0].existing,undefined);
 assert.equal(debtMath.debtTotals(await debtStore.listDebts(db),await debtStore.listDebtPayments(db)).owed,30000);
 assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'),[]);
 await debtStore.createDebt(db,sampleDebt({id:'tracked',existing:true,accountId:undefined}));
 assert.equal((await listTransactions(db)).length,2);
});


test('service exchange preserves recorded history when saving, editing and deleting from a 6000 bank balance', async t => {
  const db = await setup(t);
  const { saveAccount, listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
  const { exchangeDraft } = require('../../.expo/finance-tests/exchanges.js');
  const cash = await getCashAccount(db);
  await saveAccount(db, { ...cash, id: 'bank', name: 'MariBank', openingBalance: 1000000 }, true);
  await createTransaction(db, 'earlier-expense', { ...expense(), accountId: 'bank', amount: 400000 });
  const balance = async id => calculateAccountSummary((await listAccounts(db)).find(account => account.id === id), await listTransactions(db), '2026-10').balance;
  assert.equal(await balance('bank'), 600000);
  const cashBefore = await balance('cash');
  const draft = paid => exchangeDraft('bank', { kind: 'Service sale', paid, received: 15000, receivedAccountId: 'cash', extraAccountId: 'cash', earningsConfirmed: true }, '2026-10-13', '12:00:00');
  await createTransaction(db, 'exchange-history', draft(14850));
  assert.equal(await balance('bank'), 585150);
  assert.equal(await balance('cash'), cashBefore + 15000);
  await updateTransaction(db, 'exchange-history', draft(14700));
  assert.equal(await balance('bank'), 585300);
  assert.equal(await balance('cash'), cashBefore + 15000);
  await deleteTransaction(db, 'exchange-history');
  assert.equal(await balance('bank'), 600000);
  assert.equal(await balance('cash'), cashBefore);
  assert.ok(await getTransaction(db, 'earlier-expense'));
});

const sampleAddition = (overrides={}) => ({id:'addition',debtId:'loan',amount:15000,accountId:'cash',transactionDate:'2026-10-21',transactionTime:'10:00:00',createdAt:'2026-10-21T02:00:00.000Z',...overrides});

test('additional borrowing preserves repayments and only moves the new amount in either direction',async t=>{
 for(const kind of ['owe','owed']) {
  const db=await setup(t);await updateOpeningBalance(db,100000);
  await debtStore.createDebt(db,sampleDebt({kind}));await debtStore.recordDebtPayment(db,samplePayment());
  const before=await listTransactions(db), balance=calculateAccountSummary(await getCashAccount(db),before,'2026-10').balance;
  await debtStore.recordDebtAddition(db,sampleAddition());await debtStore.recordDebtAddition(db,sampleAddition());
  const rows=await listTransactions(db),progress=debtMath.debtProgress((await debtStore.listDebts(db))[0],await debtStore.listDebtPayments(db),await debtStore.listDebtAdditions(db));
  assert.equal(progress.remaining,45000);assert.equal(progress.paid,20000);assert.equal(progress.totalBorrowed,65000);
  assert.equal(rows.length,3);assert.deepEqual(rows.filter(row=>row.id!=='addition'),before);
  const summary=calculateAccountSummary(await getCashAccount(db),rows,'2026-10');
  assert.equal(summary.balance,balance+(kind==='owe'?15000:-15000));assert.equal(summary.monthlyIncome,0);assert.equal(summary.monthlyExpenses,0);
  await debtStore.removeDebtAddition(db,'addition');assert.deepEqual(await listTransactions(db),before);
 }
});

test('tracking-only additions reopen settled debts without moving money and can then be repaid',async t=>{
 const db=await setup(t);await debtStore.createDebt(db,sampleDebt({existing:true,accountId:undefined}));
 await debtStore.recordDebtPayment(db,samplePayment({amount:50000}));
 const before=await listTransactions(db);
 await debtStore.recordDebtAddition(db,sampleAddition({existing:true,accountId:undefined}));
 assert.deepEqual(await listTransactions(db),before);
 assert.equal(debtMath.debtProgress(sampleDebt(),await debtStore.listDebtPayments(db),await debtStore.listDebtAdditions(db)).remaining,15000);
 await debtStore.recordDebtPayment(db,samplePayment({id:'last',amount:15000,transactionDate:'2026-10-22'}));
 assert.equal(debtMath.debtTotals(await debtStore.listDebts(db),await debtStore.listDebtPayments(db),await debtStore.listDebtAdditions(db)).owed,0);
 await assert.rejects(debtStore.removeDebtAddition(db,'addition'),/exceed/);
 await debtStore.removeDebtRecord(db,'loan');assert.deepEqual(await listTransactions(db),[]);assert.deepEqual(await debtStore.listDebtAdditions(db),[]);
});

test('original amount correction updates only the initial movement and rejects stale or underpaid history',async t=>{
 const db=await setup(t);await debtStore.createDebt(db,sampleDebt());await debtStore.recordDebtPayment(db,samplePayment());await debtStore.recordDebtAddition(db,sampleAddition());
 const repayments=await debtStore.listDebtPayments(db), additions=await debtStore.listDebtAdditions(db);
 await debtStore.correctDebtAmount(db,'loan',60000,50000);
 assert.equal((await debtStore.listDebts(db))[0].amount,60000);assert.equal((await getTransaction(db,'loan')).amount,60000);
 assert.deepEqual(await debtStore.listDebtPayments(db),repayments);assert.deepEqual(await debtStore.listDebtAdditions(db),additions);
 const before=await listTransactions(db);
 await assert.rejects(debtStore.correctDebtAmount(db,'loan',70000,50000),/changed/);
 await assert.rejects(debtStore.correctDebtAmount(db,'loan',10000,60000),/on that date/);
 await assert.rejects(debtStore.correctDebtAmount(db,'loan',0,60000),/greater than zero/);
 assert.deepEqual(await listTransactions(db),before);
 const tracked=sampleDebt({id:'old',existing:true,accountId:undefined});await debtStore.createDebt(db,tracked);
 await debtStore.correctDebtAmount(db,'old',45000,50000);assert.deepEqual(await listTransactions(db),before);
});

test('addition validation, linked movement guards and overflow roll back without changing records',async t=>{
 const db=await setup(t);const {saveAccountDetails,deleteAccount}=require('../../.expo/finance-tests/storage/accounts.js');
 await saveAccountDetails(db,{...await getCashAccount(db),id:'bank',name:'Bank'},true);
 await debtStore.createDebt(db,sampleDebt({existing:true,accountId:undefined}));
 for(const addition of [sampleAddition({amount:0}),sampleAddition({amount:Number.MAX_SAFE_INTEGER}),sampleAddition({existing:true}),sampleAddition({transactionDate:'2026-10-18'}),sampleAddition({debtId:'missing'}),sampleAddition({id:'loan'})]) await assert.rejects(debtStore.recordDebtAddition(db,addition));
 assert.deepEqual(await listTransactions(db),[]);assert.deepEqual(await debtStore.listDebtAdditions(db),[]);
 await debtStore.recordDebtAddition(db,sampleAddition({accountId:'bank'}));
 await assert.rejects(deleteTransaction(db,'addition'),/Debts/);
 const {updateExternalTransfer}=require('../../.expo/finance-tests/storage/transactions.js');
 await assert.rejects(updateExternalTransfer(db,'addition',{...await getTransaction(db,'addition'),amount:1}),/Debts/);
 await assert.rejects(deleteAccount(db,'bank'),/debt records/);
 await assert.rejects(debtStore.recordDebtAddition(db,sampleAddition({accountId:'bank',amount:1})),/already/);
 await debtStore.removeDebtRecord(db,'loan');assert.deepEqual(await listTransactions(db),[]);
});

test('additional borrowing JSON and Excel backups restore complete history and reject broken links',async t=>{
 const db=await setup(t);await debtStore.createDebt(db,sampleDebt());await debtStore.recordDebtPayment(db,samplePayment());
 await debtStore.recordDebtAddition(db,sampleAddition());await debtStore.recordDebtAddition(db,sampleAddition({id:'tracked',existing:true,accountId:undefined}));
 const {parseBackup}=require('../../.expo/finance-tests/backup.js');
 const {readBackupJson,restoreBackup,resetFinancialData}=require('../../.expo/finance-tests/storage/backup.js');
 const {createExcelBackup,parseExcelBackup}=require('../../.expo/finance-tests/excel-backup.js');
 const backup=parseBackup(await readBackupJson(db)), excel=parseExcelBackup(createExcelBackup(backup));
 assert.equal(backup.version,14);assert.deepEqual(excel,backup);
 for(const payload of [backup,excel]) {
  await resetFinancialData(db);assert.deepEqual(await debtStore.listDebtAdditions(db),[]);
  await restoreBackup(db,payload);assert.deepEqual(JSON.parse(JSON.stringify(await debtStore.listDebtAdditions(db))),backup.debtAdditions);
  assert.equal(debtMath.debtTotals(await debtStore.listDebts(db),await debtStore.listDebtPayments(db),await debtStore.listDebtAdditions(db)).owed,60000);
 }
 const before=await listTransactions(db);
 for(const payload of [{...backup,version:13},{...backup,debtAdditions:undefined},{...backup,transactions:backup.transactions.filter(row=>row.id!=='addition')},{...backup,debtAdditions:[{...backup.debtAdditions[0],debtId:'missing'}]}])await assert.rejects(restoreBackup(db,payload));
 assert.deepEqual(await listTransactions(db),before);
});

test('version 17 migration preserves existing debt history and rolls back on interruption',async t=>{
 const db=await setup(t);await debtStore.createDebt(db,sampleDebt());await debtStore.recordDebtPayment(db,samplePayment());
 const before=await listTransactions(db);await db.execAsync('DROP TABLE debt_additions; PRAGMA user_version = 16');
 const exec=db.execAsync;db.execAsync=async sql=>{await exec(sql);if(sql.includes('CREATE TABLE IF NOT EXISTS debt_additions'))throw new Error('interrupted upgrade');};
 await assert.rejects(initializeDatabase(db),/interrupted/);assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,16);
 assert.equal(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name='debt_additions'"),null);
 db.execAsync=exec;await initializeDatabase(db);assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,17);
 assert.deepEqual(await listTransactions(db),before);assert.equal((await debtStore.listDebtPayments(db)).length,1);
 assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'),[]);
});
