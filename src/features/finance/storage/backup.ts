import { parseBackup, serializeBackup, type FinanceBackup } from '../backup';
import { getCashAccount } from './accounts';
import { listTransactions } from './transactions';
import type { FinanceDatabase } from './database';

/** Read both tables in one transaction so the exported records form one snapshot. */
export async function readBackupJson(db: FinanceDatabase): Promise<string> {
  let json: string | undefined;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const account = await getCashAccount(transaction);
    const transactions = await listTransactions(transaction);
    json = serializeBackup(account, transactions);
  });
  if (json === undefined) throw new Error('Could not read financial records for backup.');
  return json;
}

/** Replace the MVP records only after UI confirmation; any failure rolls back. */
export async function restoreBackup(db: FinanceDatabase, backup: FinanceBackup): Promise<void> {
  // Validate and detach before the first await so callers cannot change pending data.
  const validated = parseBackup(JSON.stringify(backup));
  const account = validated.accounts[0];
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await transaction.getAllAsync<{ id: string }>('SELECT id FROM accounts');
    if (existing.length !== 1 || existing[0].id !== 'cash') {
      throw new Error('Restore currently supports a database containing only the Cash account.');
    }
    await transaction.runAsync('DELETE FROM transactions');
    const result = await transaction.runAsync(
      'UPDATE accounts SET name = ?, currency = ?, openingBalance = ?, purpose = ?, includedInAvailable = ?, archived = ? WHERE id = ?',
      account.name, account.currency, account.openingBalance, account.purpose,
      account.includedInAvailable ? 1 : 0, account.archived ? 1 : 0, account.id,
    );
    if (result.changes !== 1) throw new Error('Could not restore the Cash account.');
    for (const record of validated.transactions) {
      await transaction.runAsync(
        'INSERT INTO transactions (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        record.id, record.accountId, record.type, record.amount, record.category,
        record.transactionDate, record.transactionTime, record.notes ?? null, record.createdAt, record.updatedAt,
      );
    }
  });
}