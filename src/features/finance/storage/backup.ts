import { serializeBackup } from '../backup';
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
