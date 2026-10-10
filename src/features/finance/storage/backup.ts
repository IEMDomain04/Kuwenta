import { parseBackup, serializeBackup, type FinanceBackup } from '../backup';
import { listAccounts } from './accounts';
import { listGoals } from './goals';
import { listTransactions } from './transactions';
import type { FinanceDatabase } from './database';

/** Both tables are read in one transaction for a consistent snapshot. */
export async function readBackupJson(db: FinanceDatabase): Promise<string> {
  let json: string | undefined;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    json = serializeBackup(await listAccounts(transaction), await listTransactions(transaction), new Date().toISOString(), await listGoals(transaction));
  });
  if (json === undefined) throw new Error('Could not read financial records for backup.');
  return json;
}
/** Explicit replacement only after UI confirmation. Any failure rolls back all accounts and records. */
export async function restoreBackup(db: FinanceDatabase, backup: FinanceBackup): Promise<void> {
  const validated = parseBackup(JSON.stringify(backup));
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM goals');
    await transaction.runAsync('DELETE FROM transactions');
    await transaction.runAsync('DELETE FROM accounts');
    for (const account of validated.accounts) {
      await transaction.runAsync('INSERT INTO accounts (id, name, currency, openingBalance, purpose, includedInAvailable, archived) VALUES (?, ?, ?, ?, ?, ?, ?)',
        account.id, account.name, account.currency, account.openingBalance, account.purpose, account.includedInAvailable ? 1 : 0, account.archived ? 1 : 0);
    }
    for (const record of validated.transactions) {
      await transaction.runAsync('INSERT INTO transactions (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, adjustmentDirection, destinationAccountId, sourcePurpose, destinationPurpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        record.id, record.accountId, record.type, record.amount, record.category, record.transactionDate, record.transactionTime, record.notes ?? null, record.createdAt, record.updatedAt, record.adjustmentDirection ?? null, record.destinationAccountId ?? null, record.sourcePurpose ?? null, record.destinationPurpose ?? null);
    }
    for (const goal of validated.goals ?? []) {
      await transaction.runAsync('INSERT INTO goals(id, name, accountId, targetAmount, targetDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        goal.id, goal.name, goal.accountId, goal.targetAmount, goal.targetDate ?? null, goal.createdAt, goal.updatedAt);
    }
  });
}