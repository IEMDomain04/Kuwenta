import type { Account } from '../types';
import { validateAccount } from '../validation';
import type { FinanceDatabase } from './database';

type AccountRow = Omit<Account, 'includedInAvailable' | 'archived'> & {
  includedInAvailable: number; archived: number;
};

export async function getCashAccount(db: FinanceDatabase): Promise<Account> {
  const row = await db.getFirstAsync<AccountRow>("SELECT * FROM accounts WHERE id = 'cash'");
  if (!row) throw new Error('Cash account is missing.');
  if (![0, 1].includes(row.includedInAvailable) || ![0, 1].includes(row.archived)) {
    throw new Error('Invalid stored account flags.');
  }
  const account = { ...row, includedInAvailable: row.includedInAvailable === 1, archived: row.archived === 1 };
  validateAccount(account);
  return account;
}

/** Opening balance is a separate adjustment, never an income record. */
export async function updateOpeningBalance(db: FinanceDatabase, cents: number): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const account = await getCashAccount(transaction);
    validateAccount({ ...account, openingBalance: cents });
    if (account.archived) throw new Error('Cannot change an archived account.');
    await transaction.runAsync("UPDATE accounts SET openingBalance = ? WHERE id = 'cash'", cents);
  });
}
