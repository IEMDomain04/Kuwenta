import { exchangeRecords, validateExchangeLinks } from '../exchanges';
import { philippineDateTime } from '../dates';
import type { Account, Transaction, TransactionDraft } from '../types';
import { validateDraft, validateManualRecord } from '../validation';
import { getAccount, listAccounts, saveAccountDetails, type AccountBalanceChange } from './accounts';
import { calculateFinanceSummary, calculateAccountSummary } from '../calculations';
import type { FinanceDatabase } from './database';

type TransactionRow = Omit<Transaction, 'notes' | 'destinationAccountId' | 'adjustmentDirection' | 'sourcePurpose' | 'destinationPurpose' | 'externalName' | 'exchange' | 'exchangeParentId'> & {
  sourcePurpose?: 'spending' | 'savings' | null; destinationPurpose?: 'spending' | 'savings' | null;
  exchange?: string | null; exchangeParentId?: string | null;
  externalName: string | null;
  notes: string | null; destinationAccountId: string | null; adjustmentDirection: 'increase' | 'decrease' | null;
};
function fromRow(row: TransactionRow): Transaction {
  const record = { ...row, exchange: row.exchange ? JSON.parse(row.exchange) : undefined, exchangeParentId: row.exchangeParentId ?? undefined, externalName: row.externalName ?? undefined, sourcePurpose: row.sourcePurpose ?? undefined, destinationPurpose: row.destinationPurpose ?? undefined, notes: row.notes ?? undefined, destinationAccountId: row.destinationAccountId ?? undefined, adjustmentDirection: row.adjustmentDirection ?? undefined };
  validateManualRecord(record);
  return record;
}
function validateId(id: string) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Transaction ID is required.');
}
/** Generate once per submission and reuse for Save retries. Also used for new account IDs. */
export async function createTransactionId(db: FinanceDatabase): Promise<string> {
  const row = await db.getFirstAsync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
  if (!row) throw new Error('Could not generate an ID.');
  return row.id;
}
export async function getTransaction(db: FinanceDatabase, id: string): Promise<Transaction | null> {
  validateId(id);
  const row = await db.getFirstAsync<TransactionRow>('SELECT * FROM transactions WHERE id = ?', id);
  return row ? fromRow(row) : null;
}
export async function listTransactions(db: FinanceDatabase): Promise<Transaction[]> {
  const rows = (await db.getAllAsync<TransactionRow>('SELECT * FROM transactions ORDER BY transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC')).map(fromRow);
  validateExchangeLinks(rows); return rows;
}
export async function createTransaction(db: FinanceDatabase, id: string, draft: TransactionDraft): Promise<Transaction> {
  if (draft.exchange) return saveExchange(db, id, draft, false);
  validateId(id);
  let saved: Transaction | undefined;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await getTransaction(transaction, id);
    if (existing) { saved = existing; return; }
    validateDraft(draft, await getAccount(transaction, draft.accountId), draft.type === 'TRANSFER' ? await getAccount(transaction, draft.destinationAccountId!) : undefined);
    const sourcePurpose = draft.type === 'TRANSFER' ? (await getAccount(transaction, draft.accountId)).purpose : null;
    const destinationPurpose = draft.type === 'TRANSFER' ? (await getAccount(transaction, draft.destinationAccountId!)).purpose : null;
    const now = new Date().toISOString();
    await transaction.runAsync('INSERT INTO transactions (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, destinationAccountId, sourcePurpose, destinationPurpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, draft.accountId, draft.type, draft.amount, draft.category, draft.transactionDate, draft.transactionTime, draft.notes ?? null, now, now, draft.destinationAccountId ?? null, sourcePurpose, destinationPurpose);
    await transaction.runAsync("INSERT INTO preferences(key, value) VALUES ('lastEntryAccount', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", draft.accountId);
    saved = await getTransaction(transaction, id) ?? undefined;
    if (!saved) throw new Error('Could not retrieve the saved transaction.');
    calculateFinanceSummary(await listAccounts(transaction), await listTransactions(transaction), draft.transactionDate.slice(0, 7));
  });
  return saved!;
}
/** Only after confirmation; validates both account balances before committing a move. */
export async function updateTransaction(db: FinanceDatabase, id: string, draft: TransactionDraft): Promise<Transaction> {
  if (draft.exchange) return saveExchange(db, id, draft, true);
  validateId(id);
  let saved: Transaction | undefined;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    validateDraft(draft, await getAccount(transaction, draft.accountId), draft.type === 'TRANSFER' ? await getAccount(transaction, draft.destinationAccountId!) : undefined);
    const original = await getTransaction(transaction, id);
    if (!original) throw new Error('Transaction no longer exists.');
    if (original.exchange || original.exchangeParentId) throw new Error('Edit this through its linked exchange.');
    if (original.type === 'ADJUSTMENT') throw new Error('Use Edit account to make another balance correction.');
    if ((await getAccount(transaction, original.accountId)).archived) throw new Error('Unarchive the original account before editing its transactions.');
    if (original.type === 'TRANSFER' && (await getAccount(transaction, original.destinationAccountId!)).archived) throw new Error('Unarchive the original destination before editing this transfer.');
    const unchangedEndpoints = original.type === 'TRANSFER' && draft.type === 'TRANSFER' && original.accountId === draft.accountId && original.destinationAccountId === draft.destinationAccountId;
    const sourcePurpose = draft.type === 'TRANSFER' ? unchangedEndpoints ? original.sourcePurpose ?? null : (await getAccount(transaction, draft.accountId)).purpose : null;
    const destinationPurpose = draft.type === 'TRANSFER' ? unchangedEndpoints ? original.destinationPurpose ?? null : (await getAccount(transaction, draft.destinationAccountId!)).purpose : null;
    const updatedAt = [new Date().toISOString(), original.updatedAt].sort().at(-1)!;
    await transaction.runAsync('UPDATE transactions SET type = ?, accountId = ?, amount = ?, category = ?, transactionDate = ?, transactionTime = ?, notes = ?, updatedAt = ?, destinationAccountId = ?, sourcePurpose = ?, destinationPurpose = ? WHERE id = ?',
      draft.type, draft.accountId, draft.amount, draft.category, draft.transactionDate, draft.transactionTime, draft.notes ?? null, updatedAt, draft.destinationAccountId ?? null, sourcePurpose, destinationPurpose, id);
    saved = await getTransaction(transaction, id) ?? undefined;
    if (!saved) throw new Error('Could not retrieve the updated transaction.');
    const accounts = await listAccounts(transaction);
    const rows = await listTransactions(transaction);
    calculateFinanceSummary(accounts, rows, draft.transactionDate.slice(0, 7));
    calculateFinanceSummary(accounts, rows, original.transactionDate.slice(0, 7));
  });
  return saved!;
}
export async function deleteTransaction(db: FinanceDatabase, id: string): Promise<void> {
  validateId(id);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const original = await getTransaction(transaction, id);
    if (await transaction.getFirstAsync('SELECT id FROM debts WHERE id = ? UNION ALL SELECT id FROM debt_payments WHERE id = ?',id,id)) throw new Error('Manage this movement in Plans > Debts.');
    if (!original) return;
    await transaction.runAsync('DELETE FROM transactions WHERE id = ?', original.exchangeParentId ?? id);
    calculateFinanceSummary(await listAccounts(transaction), await listTransactions(transaction), original.transactionDate.slice(0, 7));
  });
}
/** Account details and current-balance correction commit or roll back together. */
export async function saveAccountWithBalance(db: FinanceDatabase, account: Account, change: AccountBalanceChange): Promise<void> {
  await db.withExclusiveTransactionAsync(async transaction => {
    const original = await getAccount(transaction, account.id);
    if (account.openingBalance !== original.openingBalance || account.archived) throw new Error('Current balance edits must keep the starting balance and account active.');
    await saveAccountDetails(transaction, account, false);
    await applyBalanceAdjustment(transaction, change.id, account.id, change.target, change.expected);
  });
}
/** Confirmed target balance correction, with a stable submission ID and stale-balance protection. */
export async function adjustAccountBalance(db: FinanceDatabase, id: string, accountId: string, target: number, expected: number): Promise<void> {
  await db.withExclusiveTransactionAsync(transaction => applyBalanceAdjustment(transaction, id, accountId, target, expected));
}
/** Reuses the balance-correction logic inside an existing account-edit transaction. */
export async function applyBalanceAdjustment(transaction: FinanceDatabase, id: string, accountId: string, target: number, expected: number): Promise<void> {
  validateId(id);
  if (!Number.isSafeInteger(target) || !Number.isSafeInteger(expected)) throw new Error('Balance must be safe integer centavos.');
  const existing = await getTransaction(transaction, id);
  if (existing) {
    if (existing.type !== 'ADJUSTMENT' || existing.accountId !== accountId) throw new Error('Submission ID is already in use.');
    return;
  }
  const account = await getAccount(transaction, accountId);
  if (account.archived) throw new Error('Unarchive the account before adjusting its balance.');
  const rows = await listTransactions(transaction);
  const current = calculateAccountSummary(account, rows, '1900-01').balance;
  if (current !== expected) throw new Error('The account balance changed. Review the new balance and try again.');
  const difference = BigInt(target) - BigInt(current);
  if (difference === 0n) return;
  const absolute = difference < 0n ? -difference : difference;
  if (absolute > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Adjustment exceeds the supported range.');
  const now = new Date();
  const dateTime = philippineDateTime(now);
  const audit = now.toISOString();
  await transaction.runAsync('INSERT INTO transactions (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, adjustmentDirection) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, accountId, 'ADJUSTMENT', Number(absolute), 'Balance adjustment', dateTime.transactionDate, dateTime.transactionTime, 'Account balance corrected', audit, audit, difference > 0n ? 'increase' : 'decrease');
  const updatedRows = await listTransactions(transaction);
  calculateFinanceSummary(await listAccounts(transaction), updatedRows, dateTime.transactionDate.slice(0, 7));
  if (calculateAccountSummary(account, updatedRows, '1900-01').balance !== target) throw new Error('Could not apply the balance correction.');
}

export async function createExternalTransfer(db: FinanceDatabase, id: string, record: Transaction): Promise<void> {
  validateId(id);
  if (record.id !== id || record.type !== 'EXTERNAL') throw new Error('Invalid external movement.');
  validateManualRecord(record);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await getTransaction(transaction, id);
    if (existing) {
      if (existing.type !== 'EXTERNAL' || existing.accountId !== record.accountId) throw new Error('Submission ID is already in use.');
      return;
    }
    const account = await getAccount(transaction, record.accountId);
    if (account.archived) throw new Error('Choose an active account.');
    await transaction.runAsync('INSERT INTO transactions (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, adjustmentDirection, externalName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, record.accountId, record.type, record.amount, record.category, record.transactionDate, record.transactionTime, record.notes ?? null, record.createdAt, record.updatedAt, record.adjustmentDirection!, record.externalName!);
    calculateFinanceSummary(await listAccounts(transaction), await listTransactions(transaction), record.transactionDate.slice(0, 7));
  });
}


/** External movements retain their identity and stay outside income/expense reports. */
export async function updateExternalTransfer(db: FinanceDatabase, id: string, record: Transaction): Promise<void> {
  validateId(id);
  if (record.id !== id || record.type !== 'EXTERNAL') throw new Error('Invalid external movement.');
  validateManualRecord(record);
  await db.withExclusiveTransactionAsync(async transaction => {
    const original = await getTransaction(transaction, id);
    if (await transaction.getFirstAsync('SELECT id FROM debts WHERE id = ? UNION ALL SELECT id FROM debt_payments WHERE id = ?',id,id)) throw new Error('Manage this movement in Plans > Debts.');
    if (!original || original.type !== 'EXTERNAL') throw new Error('This external movement is no longer available.');
    if ((await getAccount(transaction, original.accountId)).archived) throw new Error('Unarchive the original account before editing this movement.');
    if ((await getAccount(transaction, record.accountId)).archived) throw new Error('Choose an active account.');
    await transaction.runAsync('UPDATE transactions SET accountId = ?, amount = ?, transactionDate = ?, transactionTime = ?, notes = ?, updatedAt = ?, adjustmentDirection = ?, externalName = ? WHERE id = ?',
      record.accountId, record.amount, record.transactionDate, record.transactionTime, record.notes ?? null, new Date().toISOString(), record.adjustmentDirection!, record.externalName!, id);
    calculateFinanceSummary(await listAccounts(transaction), await listTransactions(transaction), record.transactionDate.slice(0, 7));
  });
}


async function saveExchange(db: FinanceDatabase, id: string, draft: TransactionDraft, editing: boolean): Promise<Transaction> {
  validateId(id); let saved: Transaction | undefined;
  await db.withExclusiveTransactionAsync(async transaction => {
    const original = await getTransaction(transaction,id);
    if (!editing && original) { if (!original.exchange) throw new Error('Submission ID is already in use.'); saved=original; return; }
    if (editing && !original?.exchange) throw new Error('Exchange no longer exists.');
    const accounts = await listAccounts(transaction);
    for (const accountId of new Set([draft.accountId,draft.exchange!.receivedAccountId,...(original?.exchange ? [original.accountId,original.exchange.receivedAccountId] : [])])) {
      const account=accounts.find(account=>account.id===accountId); if (!account || account.archived) throw new Error('Choose active accounts, or unarchive the original accounts before editing.');
    }
    const now=[new Date().toISOString(),original?.updatedAt ?? ''].sort().at(-1)!;
    const records=exchangeRecords(id,draft,original?.createdAt ?? now,now);
    if (editing) await transaction.runAsync('DELETE FROM transactions WHERE id = ?',id);
    for (const row of records) {
      validateDraft(row as TransactionDraft,accounts.find(account=>account.id===row.accountId)!,accounts.find(account=>account.id===row.destinationAccountId));
      if (row.type==='TRANSFER') { row.sourcePurpose=(original?.accountId===row.accountId ? original.sourcePurpose : undefined) ?? accounts.find(account=>account.id===row.accountId)!.purpose; row.destinationPurpose=(original && original.destinationAccountId===row.destinationAccountId ? original.destinationPurpose : undefined) ?? accounts.find(account=>account.id===row.destinationAccountId)!.purpose; }
      await transaction.runAsync('INSERT INTO transactions(id,accountId,type,amount,category,transactionDate,transactionTime,notes,createdAt,updatedAt,destinationAccountId,sourcePurpose,destinationPurpose,exchange,exchangeParentId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',row.id,row.accountId,row.type,row.amount,row.category,row.transactionDate,row.transactionTime,row.notes ?? null,row.createdAt,row.updatedAt,row.destinationAccountId ?? null,row.sourcePurpose ?? null,row.destinationPurpose ?? null,row.exchange ? JSON.stringify(row.exchange) : null,row.exchangeParentId ?? null);
    }
    await transaction.runAsync("INSERT INTO preferences(key,value) VALUES ('lastEntryAccount',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",draft.accountId);
    const rows=await listTransactions(transaction);
    calculateFinanceSummary(accounts,rows,draft.transactionDate.slice(0,7));
    if (original) calculateFinanceSummary(accounts,rows,original.transactionDate.slice(0,7));
    saved=await getTransaction(transaction,id) ?? undefined;
  });
  return saved!;
}
