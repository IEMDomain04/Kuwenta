import type { FinanceDatabase } from './database';

const VERSION = 7;
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
  });
}
