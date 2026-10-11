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
      calculateAccountSummary(account, rows.map((row) => ({ ...row, externalName: row.externalName ?? undefined, sourcePurpose: row.sourcePurpose ?? undefined, destinationPurpose: row.destinationPurpose ?? undefined, notes: row.notes ?? undefined, destinationAccountId: row.destinationAccountId ?? undefined, adjustmentDirection: row.adjustmentDirection ?? undefined })), '1900-01');
      await transaction.runAsync('UPDATE accounts SET name = ?, openingBalance = ?, purpose = ?, includedInAvailable = ?, archived = ? WHERE id = ?',
        account.name.trim(), account.openingBalance, account.purpose, account.includedInAvailable ? 1 : 0, account.archived ? 1 : 0, account.id);
    }
  });
}
/** Opening balance is a separate adjustment, never an income record. */
export async function updateOpeningBalance(db: FinanceDatabase, cents: number): Promise<void> {
  await saveAccount(db, { ...await getCashAccount(db), openingBalance: cents }, false);
}
/** Save setup exactly once; opening money is never recorded as income. */
export async function completeCashSetup(db: FinanceDatabase, cents: number, displayName = '', accountName = 'Cash'): Promise<void> {
  if (typeof displayName !== 'string' || displayName.trim().length > 50 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new Error('Name must be at most 50 characters without control characters.');
  if (typeof accountName !== 'string' || !accountName.trim() || accountName.trim().length > 50 || /[\u0000-\u001f\u007f]/.test(accountName)) throw new Error('Enter an account name up to 50 characters.');
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Starting money must be zero or positive integer centavos.');
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const completed = await transaction.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'cashSetupComplete'");
    if (completed?.value !== '0') return;
    const cash = await getCashAccount(transaction);
    if (cash.archived) throw new Error('Cash must be active for setup.');
    await transaction.runAsync("UPDATE accounts SET openingBalance = ?, name = ? WHERE id = 'cash'", cents, accountName.trim());
    await transaction.runAsync("INSERT INTO preferences(key, value) VALUES ('displayName', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", displayName.trim());
    await transaction.runAsync("UPDATE preferences SET value = '1' WHERE key = 'cashSetupComplete'");
  });
}

/** Delete only an unused, empty account; never remove financial history. */
export async function deleteAccount(db: FinanceDatabase, id: string): Promise<void> {
  if (id === 'cash') throw new Error('The default Cash account cannot be deleted. Use Reset all data to start over.');
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const account = await transaction.getFirstAsync<AccountRow>('SELECT * FROM accounts WHERE id = ?', id);
    if (!account) return; // A repeated deletion cannot affect another account.
    if (await transaction.getFirstAsync('SELECT id FROM transactions WHERE accountId = ? OR destinationAccountId = ? LIMIT 1', id, id)) throw new Error('This account has transaction history. Archive it instead to preserve your records.');
    if (await transaction.getFirstAsync('SELECT id FROM goals WHERE accountId = ? LIMIT 1', id)) throw new Error('Delete or relink the savings goal before deleting this account.');
    if (account.openingBalance !== 0) throw new Error('This account still has a balance. Resolve it before deleting the account.');
    await transaction.runAsync("DELETE FROM preferences WHERE key = 'lastEntryAccount' AND value = ?", id);
    await transaction.runAsync('DELETE FROM accounts WHERE id = ?', id);
  });
}
