import type { Account, Transaction } from '../types';
import { validateAccount } from '../validation';
import { calculateAccountSummary } from '../calculations';
import type { FinanceDatabase } from './database';

type AccountRow = Omit<Account, 'includedInAvailable' | 'archived'> & { includedInAvailable: number; archived: number };
function fromRow(row: AccountRow): Account {
  if (![0, 1].includes(row.includedInAvailable) || ![0, 1].includes(row.archived)) throw new Error('Invalid stored account flags.');
  const account = { ...row, includedInAvailable: row.includedInAvailable === 1, archived: row.archived === 1 };
  validateAccount(account);
  return account;
}
export async function listAccounts(db: FinanceDatabase): Promise<Account[]> {
  return (await db.getAllAsync<AccountRow>("SELECT * FROM accounts ORDER BY CASE WHEN id = 'cash' THEN 0 ELSE 1 END, name COLLATE NOCASE, id")).map(fromRow);
}
export async function getAccount(db: FinanceDatabase, id: string): Promise<Account> {
  const row = await db.getFirstAsync<AccountRow>('SELECT * FROM accounts WHERE id = ?', id);
  if (!row) throw new Error('The selected account does not exist.');
  return fromRow(row);
}
export function getCashAccount(db: FinanceDatabase): Promise<Account> { return getAccount(db, 'cash'); }
export async function saveAccount(db: FinanceDatabase, account: Account, creating: boolean): Promise<void> {
  validateAccount(account);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (creating) {
      const existing = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM accounts WHERE id = ?', account.id);
      if (existing) return; // Retrying a submission cannot duplicate or overwrite its account.
      await transaction.runAsync('INSERT INTO accounts (id, name, currency, openingBalance, purpose, includedInAvailable, archived) VALUES (?, ?, ?, ?, ?, ?, ?)',
        account.id, account.name.trim(), account.currency, account.openingBalance, account.purpose, account.includedInAvailable ? 1 : 0, account.archived ? 1 : 0);
    } else {
      if (account.purpose !== 'savings' && await transaction.getFirstAsync('SELECT id FROM goals WHERE accountId = ?', account.id)) throw new Error('Delete or relink the goal before changing this savings account to spending.');
      const original = await getAccount(transaction, account.id);
      if (original.archived && account.archived) throw new Error('Unarchive the account before editing its details.');
      const rows = await transaction.getAllAsync<Transaction>('SELECT * FROM transactions WHERE accountId = ? OR destinationAccountId = ?', account.id, account.id);
      calculateAccountSummary(account, rows.map((row) => ({ ...row, sourcePurpose: row.sourcePurpose ?? undefined, destinationPurpose: row.destinationPurpose ?? undefined, notes: row.notes ?? undefined, destinationAccountId: row.destinationAccountId ?? undefined, adjustmentDirection: row.adjustmentDirection ?? undefined })), '1900-01');
      await transaction.runAsync('UPDATE accounts SET name = ?, openingBalance = ?, purpose = ?, includedInAvailable = ?, archived = ? WHERE id = ?',
        account.name.trim(), account.openingBalance, account.purpose, account.includedInAvailable ? 1 : 0, account.archived ? 1 : 0, account.id);
    }
  });
}
/** Opening balance is a separate adjustment, never an income record. */
export async function updateOpeningBalance(db: FinanceDatabase, cents: number): Promise<void> {
  await saveAccount(db, { ...await getCashAccount(db), openingBalance: cents }, false);
}