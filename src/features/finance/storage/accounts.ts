import type { Account, Transaction } from '../types';
import { validateAccount } from '../validation';
import { calculateAccountSummary, calculateCurrentMoney, calculateFinanceSummary, calculateSavings } from '../calculations';
import type { FinanceDatabase } from './database';

type AccountRow = Omit<Account, 'includedInAvailable' | 'archived' | 'color' | 'icon'> & { includedInAvailable: number; archived: number; color?: Account['color'] | null; icon?: Account['icon'] | null };
function fromRow(row: AccountRow): Account {
  if (![0, 1].includes(row.includedInAvailable) || ![0, 1].includes(row.archived)) throw new Error('Invalid stored account flags.');
  const { color, icon, ...fields } = row;
  const account: Account = { ...fields, includedInAvailable: row.includedInAvailable === 1, archived: row.archived === 1, ...(color == null ? {} : { color }), ...(icon == null ? {} : { icon }) };
  validateAccount(account);
  return account;
}
export async function listAccounts(db: FinanceDatabase): Promise<Account[]> {
  const accounts = (await db.getAllAsync<AccountRow>("SELECT * FROM accounts ORDER BY CASE WHEN id = 'cash' THEN 0 ELSE 1 END, name COLLATE NOCASE, id")).map(fromRow);
  const preference = await db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'accountOrder'");
  try {
    const ids: unknown = JSON.parse(preference?.value ?? '[]');
    if (Array.isArray(ids) && ids.every(id => typeof id === 'string')) {
      const rank = new Map(ids.map((id, index) => [id, index]));
      accounts.sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length));
    }
  } catch { /* Invalid display preferences must not block financial records. */ }
  return accounts;
}
export async function getAccount(db: FinanceDatabase, id: string): Promise<Account> {
  const row = await db.getFirstAsync<AccountRow>('SELECT * FROM accounts WHERE id = ?', id);
  if (!row) throw new Error('The selected account does not exist.');
  return fromRow(row);
}
export function getCashAccount(db: FinanceDatabase): Promise<Account> { return getAccount(db, 'cash'); }
export type AccountBalanceChange = { id: string; target: number; expected: number };
export async function saveAccount(db: FinanceDatabase, account: Account, creating: boolean): Promise<void> {
  await db.withExclusiveTransactionAsync(transaction => saveAccountDetails(transaction, account, creating));
}
/** Applies account details inside an existing exclusive transaction. */
export async function saveAccountDetails(transaction: FinanceDatabase, account: Account, creating: boolean): Promise<void> {
  validateAccount(account);
  if (creating) {
    const existing = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM accounts WHERE id = ?', account.id);
    if (existing) return; // Retrying a submission cannot duplicate or overwrite its account.
    await transaction.runAsync('INSERT INTO accounts (id, name, currency, openingBalance, purpose, includedInAvailable, archived, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      account.id, account.name.trim(), account.currency, account.openingBalance, account.purpose, account.includedInAvailable ? 1 : 0, account.archived ? 1 : 0, account.color ?? null, account.icon ?? null);
  } else {
    if (account.purpose !== 'savings' && await transaction.getFirstAsync('SELECT id FROM goals WHERE accountId = ?', account.id)) throw new Error('Delete or relink the goal before changing this savings account to spending.');
    const original = await getAccount(transaction, account.id);
    if (original.archived && account.archived) throw new Error('Unarchive the account before editing its details.');
    const rows = await transaction.getAllAsync<Transaction>('SELECT * FROM transactions WHERE accountId = ? OR destinationAccountId = ?', account.id, account.id);
    calculateAccountSummary(account, rows.map((row) => ({ ...row, exchange: typeof row.exchange === 'string' ? JSON.parse(row.exchange) : row.exchange ?? undefined, exchangeParentId: row.exchangeParentId ?? undefined, externalName: row.externalName ?? undefined, sourcePurpose: row.sourcePurpose ?? undefined, destinationPurpose: row.destinationPurpose ?? undefined, notes: row.notes ?? undefined, destinationAccountId: row.destinationAccountId ?? undefined, adjustmentDirection: row.adjustmentDirection ?? undefined })), '1900-01');
    await transaction.runAsync('UPDATE accounts SET name = ?, openingBalance = ?, purpose = ?, includedInAvailable = ?, archived = ?, color = ?, icon = ? WHERE id = ?',
      account.name.trim(), account.openingBalance, account.purpose, account.includedInAvailable ? 1 : 0, account.archived ? 1 : 0, account.color ?? null, account.icon ?? null, account.id);
  }
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

/** Permanent deletion after UI confirmation; archive remains the option that keeps records. */
export async function deleteAccount(db: FinanceDatabase, id: string): Promise<void> {
  if (id === 'cash') throw new Error('The default Cash account cannot be deleted. Use Reset all data to start over.');
  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (await transaction.getFirstAsync('SELECT id FROM debts WHERE accountId = ? UNION ALL SELECT id FROM debt_payments WHERE accountId = ?',id,id)) throw new Error('This account has debt records. Archive it to keep them, or remove those records in Plans > Debts first.');
    const account = await transaction.getFirstAsync<AccountRow>('SELECT * FROM accounts WHERE id = ?', id);
    if (!account) return; // Repeated deletion cannot affect another account.
    const removed = await transaction.getAllAsync<{ transactionDate: string }>('SELECT transactionDate FROM transactions WHERE accountId = ? OR destinationAccountId = ?', id, id);
    const linked = await transaction.getAllAsync<{ id: string; exchangeParentId?: string }>('SELECT id, exchangeParentId FROM transactions WHERE accountId = ? OR destinationAccountId = ?', id, id);
    for (const row of linked) if (row.exchangeParentId) await transaction.runAsync('DELETE FROM transactions WHERE id = ?', row.exchangeParentId);
    await transaction.runAsync('DELETE FROM goals WHERE accountId = ?', id);
    await transaction.runAsync('DELETE FROM transactions WHERE accountId = ? OR destinationAccountId = ?', id, id);
    await transaction.runAsync("DELETE FROM preferences WHERE key = 'lastEntryAccount' AND value = ?", id);
    const order = await transaction.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'accountOrder'");
    if (order) {
      let ids: unknown;
      try { ids = JSON.parse(order.value); } catch { /* Discard malformed display preferences. */ }
      if (Array.isArray(ids) && ids.every(value => typeof value === 'string')) {
        await transaction.runAsync("UPDATE preferences SET value = ? WHERE key = 'accountOrder'", JSON.stringify(ids.filter(value => value !== id)));
      } else {
        await transaction.runAsync("DELETE FROM preferences WHERE key = 'accountOrder'");
      }
    }
    await transaction.runAsync('DELETE FROM accounts WHERE id = ?', id);
    const remainingAccounts = await listAccounts(transaction);
    const remainingRows = (await transaction.getAllAsync<Transaction>('SELECT * FROM transactions')).map(row => ({
      ...row, exchange: typeof row.exchange === 'string' ? JSON.parse(row.exchange) : row.exchange ?? undefined, exchangeParentId: row.exchangeParentId ?? undefined, notes: row.notes ?? undefined, externalName: row.externalName ?? undefined,
      sourcePurpose: row.sourcePurpose ?? undefined, destinationPurpose: row.destinationPurpose ?? undefined,
      destinationAccountId: row.destinationAccountId ?? undefined, adjustmentDirection: row.adjustmentDirection ?? undefined,
    }));
    // Removing transfers or offsetting balances must not leave unsupported totals.
    calculateCurrentMoney(remainingAccounts, remainingRows);
    calculateSavings(remainingAccounts, remainingRows, '1900-01');
    for (const month of new Set(removed.map(row => row.transactionDate.slice(0, 7)))) {
      calculateFinanceSummary(remainingAccounts, remainingRows, month);
    }
  });
}

/** Profile edits change only the local greeting preference. */
export async function saveDisplayName(db: FinanceDatabase, name: string): Promise<void> {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Please enter your name.');
  if (name.trim().length > 50 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Use a name up to 50 characters.');
  await db.runAsync("INSERT INTO preferences(key, value) VALUES ('displayName', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", name.trim());
}

/** Display order only; account balances and transaction records remain unchanged. */
export async function saveAccountOrder(db: FinanceDatabase, ids: readonly string[]): Promise<void> {
  await db.withExclusiveTransactionAsync(async transaction => {
    const accounts = await transaction.getAllAsync<{ id: string }>('SELECT id FROM accounts');
    if (ids.length !== accounts.length || new Set(ids).size !== ids.length || accounts.some(account => !ids.includes(account.id))) throw new Error('Accounts changed. Try rearranging them again.');
    await transaction.runAsync("INSERT INTO preferences(key, value) VALUES ('accountOrder', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(ids));
  });
}
