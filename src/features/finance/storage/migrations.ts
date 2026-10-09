import type { FinanceDatabase } from './database';

const VERSION = 1;
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
  });
}
