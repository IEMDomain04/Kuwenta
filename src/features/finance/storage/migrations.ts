import { normalizeServiceExchanges } from '../exchanges';
import { calculateAccountSummary } from '../calculations';
import type { Account, Transaction } from '../types';
import type { FinanceDatabase } from './database';

const VERSION = 14;
const schema = `
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0),
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  currency TEXT NOT NULL CHECK(currency = 'PHP'),
  openingBalance INTEGER NOT NULL CHECK(typeof(openingBalance) = 'integer' AND openingBalance BETWEEN -9007199254740991 AND 9007199254740991),
  purpose TEXT NOT NULL CHECK(purpose IN ('spending', 'savings')),
  includedInAvailable INTEGER NOT NULL CHECK(includedInAvailable IN (0, 1)),
  archived INTEGER NOT NULL CHECK(archived IN (0, 1))
);
CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0),
  accountId TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
  amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount BETWEEN 1 AND 9007199254740991),
  category TEXT NOT NULL CHECK(length(trim(category)) > 0),
  transactionDate TEXT NOT NULL CHECK(length(transactionDate) = 10 AND transactionDate GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND transactionDate BETWEEN '1900-01-01' AND '9999-12-31' AND date(transactionDate, '+0 days') IS NOT NULL AND date(transactionDate, '+0 days') = transactionDate),
  transactionTime TEXT NOT NULL CHECK(length(transactionTime) = 8 AND transactionTime GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]' AND transactionTime <= '23:59:59'),
  notes TEXT,
  createdAt TEXT NOT NULL CHECK(length(createdAt) = 24 AND substr(createdAt, 24, 1) = 'Z'),
  updatedAt TEXT NOT NULL CHECK(length(updatedAt) = 24 AND substr(updatedAt, 24, 1) = 'Z' AND updatedAt >= createdAt),
  destinationAccountId TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  adjustmentDirection TEXT CHECK(adjustmentDirection IN ('increase', 'decrease')),
  CHECK(destinationAccountId IS NULL AND adjustmentDirection IS NULL)
);
CREATE INDEX transactions_history ON transactions(accountId, transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC);
INSERT INTO accounts(id, name, currency, openingBalance, purpose, includedInAvailable, archived)
  VALUES ('cash', 'Cash', 'PHP', 0, 'spending', 1, 0);
PRAGMA user_version = 1;
`;

export async function migrateDatabase(db: FinanceDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const version = row?.user_version ?? 0;
    if (version > VERSION) throw new Error('This database requires a newer version of Kuwenta.');
    if (version === 0) await transaction.execAsync(schema);
    if (version < 2) await transaction.execAsync('CREATE INDEX IF NOT EXISTS transactions_all_history ON transactions(transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC); PRAGMA user_version = 2;');
    if (version < 3) {
      const table = schema.slice(schema.indexOf('CREATE TABLE transactions ('), schema.indexOf('CREATE INDEX transactions_history'))
        .replace('CREATE TABLE transactions (', 'CREATE TABLE transactions_new (')
        .replace("type IN ('INCOME', 'EXPENSE')", "type IN ('INCOME', 'EXPENSE', 'ADJUSTMENT')")
        .replace('CHECK(destinationAccountId IS NULL AND adjustmentDirection IS NULL)',
          "CHECK(destinationAccountId IS NULL AND ((type IN ('INCOME', 'EXPENSE') AND adjustmentDirection IS NULL) OR (type = 'ADJUSTMENT' AND category = 'Balance adjustment' AND adjustmentDirection IS NOT NULL AND adjustmentDirection IN ('increase', 'decrease'))))");
      await transaction.execAsync(table);
      await transaction.execAsync('INSERT INTO transactions_new (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, destinationAccountId, adjustmentDirection) SELECT id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, destinationAccountId, adjustmentDirection FROM transactions; DROP TABLE transactions; ALTER TABLE transactions_new RENAME TO transactions; CREATE INDEX transactions_history ON transactions(accountId, transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC); CREATE INDEX transactions_all_history ON transactions(transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC); PRAGMA user_version = 3;');
    }

    if (version < 4) {
      const table = schema.slice(schema.indexOf('CREATE TABLE transactions ('), schema.indexOf('CREATE INDEX transactions_history'))
        .replace('CREATE TABLE transactions (', 'CREATE TABLE transactions_new (')
        .replace("type IN ('INCOME', 'EXPENSE')", "type IN ('INCOME', 'EXPENSE', 'ADJUSTMENT', 'TRANSFER')")
        .replace('CHECK(destinationAccountId IS NULL AND adjustmentDirection IS NULL)',
          "CHECK((type IN ('INCOME', 'EXPENSE') AND destinationAccountId IS NULL AND adjustmentDirection IS NULL) OR (type = 'ADJUSTMENT' AND destinationAccountId IS NULL AND category = 'Balance adjustment' AND adjustmentDirection IS NOT NULL) OR (type = 'TRANSFER' AND category = 'Transfer' AND destinationAccountId IS NOT NULL AND destinationAccountId <> accountId AND adjustmentDirection IS NULL))");
      await transaction.execAsync(table);
      await transaction.execAsync('INSERT INTO transactions_new (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, destinationAccountId, adjustmentDirection) SELECT id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, destinationAccountId, adjustmentDirection FROM transactions; DROP TABLE transactions; ALTER TABLE transactions_new RENAME TO transactions; CREATE INDEX transactions_history ON transactions(accountId, transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC); CREATE INDEX transactions_all_history ON transactions(transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC); CREATE INDEX transactions_destination ON transactions(destinationAccountId); PRAGMA user_version = 4;');
    }
    if (version < 5) await transaction.execAsync(
      "ALTER TABLE transactions ADD COLUMN sourcePurpose TEXT CHECK(sourcePurpose IN ('spending', 'savings')); ALTER TABLE transactions ADD COLUMN destinationPurpose TEXT CHECK(destinationPurpose IN ('spending', 'savings')); CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY NOT NULL CHECK(length(trim(id)) > 0), name TEXT NOT NULL CHECK(length(trim(name)) > 0), accountId TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT, targetAmount INTEGER NOT NULL CHECK(typeof(targetAmount) = 'integer' AND targetAmount BETWEEN 1 AND 9007199254740991), targetDate TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL CHECK(updatedAt >= createdAt)); PRAGMA user_version = 5;");
    if (version < 6) await transaction.execAsync("CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA user_version = 6;");
    if (version < 7) {
      await transaction.runAsync("INSERT OR IGNORE INTO preferences(key, value) VALUES ('cashSetupComplete', ?)", version === 0 ? '0' : '1');
      await transaction.execAsync('PRAGMA user_version = 7;');
    }
    if (version < 8) await transaction.execAsync("CREATE TABLE IF NOT EXISTS budgets (month TEXT NOT NULL, category TEXT NOT NULL, limitAmount INTEGER NOT NULL CHECK(typeof(limitAmount) = 'integer' AND limitAmount BETWEEN 1 AND 9007199254740991), PRIMARY KEY(month, category)); PRAGMA user_version = 8;");

    if (version < 9 && !(await transaction.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)')).some((column) => column.name === 'externalName')) {
      const current = await transaction.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'");
      if (!current) throw new Error('Transaction schema is missing.');
      const table = current.sql.replace(/CREATE TABLE "?transactions"?/, 'CREATE TABLE transactions_new')
        .replace("'ADJUSTMENT', 'TRANSFER'", "'ADJUSTMENT', 'TRANSFER', 'EXTERNAL'")
        .replace("type = 'ADJUSTMENT' AND destinationAccountId IS NULL AND category = 'Balance adjustment'", "(type = 'ADJUSTMENT' AND category = 'Balance adjustment' OR type = 'EXTERNAL' AND category = 'External transfer') AND destinationAccountId IS NULL");
      await transaction.execAsync(table);
      await transaction.execAsync('INSERT INTO transactions_new SELECT * FROM transactions; DROP TABLE transactions; ALTER TABLE transactions_new RENAME TO transactions; ALTER TABLE transactions ADD COLUMN externalName TEXT; CREATE INDEX transactions_history ON transactions(accountId, transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC); CREATE INDEX transactions_all_history ON transactions(transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC); CREATE INDEX transactions_destination ON transactions(destinationAccountId); PRAGMA user_version = 9;');
    }
    if (version < 9) await transaction.execAsync('PRAGMA user_version = 9;');
    if (version < 10) {
      if (!(await transaction.getAllAsync<{ name: string }>('PRAGMA table_info(accounts)')).some(column => column.name === 'color')) {
        await transaction.execAsync("ALTER TABLE accounts ADD COLUMN color TEXT CHECK(color IS NULL OR color IN ('green', 'blue', 'teal', 'plum', 'amber', 'cyan', 'indigo', 'rose', 'coral', 'brown', 'slate'));");
      }
      await transaction.execAsync('PRAGMA user_version = 10;');
    }
    if (version < 11) {
      if (version === 10) {
        // Replace only the color column constraint; account IDs and foreign keys stay intact.
        await transaction.execAsync("ALTER TABLE accounts RENAME COLUMN color TO previousColor; ALTER TABLE accounts ADD COLUMN color TEXT CHECK(color IS NULL OR color IN ('green', 'blue', 'teal', 'plum', 'amber', 'cyan', 'indigo', 'rose', 'coral', 'brown', 'slate')); UPDATE accounts SET color = previousColor; ALTER TABLE accounts DROP COLUMN previousColor;");
      }
      await transaction.execAsync('PRAGMA user_version = 11;');
    }
    if (version < 12 && !(await transaction.getAllAsync<{ name: string }>('PRAGMA table_info(accounts)')).some(column => column.name === 'icon')) await transaction.execAsync("ALTER TABLE accounts ADD COLUMN icon TEXT CHECK(icon IS NULL OR icon IN ('wallet', 'bank', 'gcash', 'maya', 'maribank', 'gotyme', 'uniondigital'));");
    if (version < 12) await transaction.execAsync('PRAGMA user_version = 12;');
    if (version < 13) {
      const columns = await transaction.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
      if (!columns.some(column => column.name === 'exchange')) await transaction.execAsync('ALTER TABLE transactions ADD COLUMN exchange TEXT;');
      if (!columns.some(column => column.name === 'exchangeParentId')) await transaction.execAsync('ALTER TABLE transactions ADD COLUMN exchangeParentId TEXT REFERENCES transactions(id) ON DELETE CASCADE;');
      await transaction.execAsync('CREATE INDEX IF NOT EXISTS transactions_exchange_parent ON transactions(exchangeParentId); PRAGMA user_version = 13;');
    }
    if (version < 14) {
      const raw = await transaction.getAllAsync<Omit<Transaction, 'exchange'> & { exchange: string | null }>('SELECT * FROM transactions');
      const rows = raw.map(row => ({ ...row, exchange: row.exchange ? JSON.parse(row.exchange) : undefined, exchangeParentId: row.exchangeParentId ?? undefined, notes: row.notes ?? undefined, destinationAccountId: row.destinationAccountId ?? undefined, adjustmentDirection: row.adjustmentDirection ?? undefined, externalName: row.externalName ?? undefined, sourcePurpose: row.sourcePurpose ?? undefined, destinationPurpose: row.destinationPurpose ?? undefined }));
      const accounts = (await transaction.getAllAsync<Account>('SELECT * FROM accounts')).map(account => ({ ...account, includedInAvailable: Boolean(account.includedInAvailable), archived: Boolean(account.archived), color: account.color ?? undefined, icon: account.icon ?? undefined }));
      const converted = normalizeServiceExchanges(rows, accounts);
      for (const account of accounts) if (calculateAccountSummary(account, rows, '1900-01').balance !== calculateAccountSummary(account, converted, '1900-01').balance) throw new Error('Service exchange migration would change an account balance.');
      const byId = new Map(converted.map(row => [row.id, row]));
      const children = new Map(converted.filter(row => row.exchangeParentId).map(row => [row.exchangeParentId, row]));
      for (const row of rows.filter(row => row.exchange?.kind === 'Service sale' && row.type === 'EXPENSE')) {
        const parent = byId.get(row.id)!;
        const child = children.get(row.id);
        await transaction.runAsync('DELETE FROM transactions WHERE exchangeParentId = ?', row.id);
        await transaction.runAsync('UPDATE transactions SET type = ?, category = ?, amount = ?, destinationAccountId = ?, sourcePurpose = ?, destinationPurpose = ?, exchange = ? WHERE id = ?', parent.type, parent.category, parent.amount, parent.destinationAccountId!, parent.sourcePurpose ?? null, parent.destinationPurpose ?? null, JSON.stringify(parent.exchange), parent.id);
        if (child) await transaction.runAsync('INSERT INTO transactions(id,accountId,type,amount,category,transactionDate,transactionTime,notes,createdAt,updatedAt,exchangeParentId) VALUES (?,?,?,?,?,?,?,?,?,?,?)', child.id, child.accountId, child.type, child.amount, child.category, child.transactionDate, child.transactionTime, child.notes ?? null, child.createdAt, child.updatedAt, child.exchangeParentId!);
      }
      await transaction.execAsync('PRAGMA user_version = 14;');
    }
  });
}
