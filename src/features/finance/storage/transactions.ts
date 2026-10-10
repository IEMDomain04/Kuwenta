import { philippineDateTime } from '../dates';
import type { Transaction, TransactionDraft } from '../types';
import { validateDraft, validateManualRecord } from '../validation';
import { getAccount, listAccounts } from './accounts';
import { calculateFinanceSummary, calculateAccountSummary } from '../calculations';
import type { FinanceDatabase } from './database';

type TransactionRow = Omit<Transaction, 'notes' | 'destinationAccountId' | 'adjustmentDirection' | 'sourcePurpose' | 'destinationPurpose'> & {
  sourcePurpose?: 'spending' | 'savings' | null; destinationPurpose?: 'spending' | 'savings' | null;
  notes: string | null; destinationAccountId: string | null; adjustmentDirection: 'increase' | 'decrease' | null;
};
function fromRow(row: TransactionRow): Transaction {
  const record = { ...row, sourcePurpose: row.sourcePurpose ?? undefined, destinationPurpose: row.destinationPurpose ?? undefined, notes: row.notes ?? undefined, destinationAccountId: row.destinationAccountId ?? undefined, adjustmentDirection: row.adjustmentDirection ?? undefined };
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
  return (await db.getAllAsync<TransactionRow>('SELECT * FROM transactions ORDER BY transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC')).map(fromRow);
}
export async function createTransaction(db: FinanceDatabase, id: string, draft: TransactionDraft): Promise<Transaction> {
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
    saved = await getTransaction(transaction, id) ?? undefined;
    if (!saved) throw new Error('Could not retrieve the saved transaction.');
    calculateFinanceSummary(await listAccounts(transaction), await listTransactions(transaction), draft.transactionDate.slice(0, 7));
  });
  return saved!;
}
/** Only after confirmation; validates both account balances before committing a move. */
export async function updateTransaction(db: FinanceDatabase, id: string, draft: TransactionDraft): Promise<Transaction> {
  validateId(id);
  let saved: Transaction | undefined;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    validateDraft(draft, await getAccount(transaction, draft.accountId), draft.type === 'TRANSFER' ? await getAccount(transaction, draft.destinationAccountId!) : undefined);
    const original = await getTransaction(transaction, id);
    if (!original) throw new Error('Transaction no longer exists.');
    if (original.type === 'ADJUSTMENT') throw new Error('Use Adjust balance on the account to make another correction.');
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
    if (!original) return;
    await transaction.runAsync('DELETE FROM transactions WHERE id = ?', id);
    calculateFinanceSummary(await listAccounts(transaction), await listTransactions(transaction), original.transactionDate.slice(0, 7));
  });
}
/** Confirmed target balance correction, with a stable submission ID and stale-balance protection. */
export async function adjustAccountBalance(db: FinanceDatabase, id: string, accountId: string, target: number, expected: number): Promise<void> {
  validateId(id);
  if (!Number.isSafeInteger(target) || !Number.isSafeInteger(expected)) throw new Error('Balance must be safe integer centavos.');
  await db.withExclusiveTransactionAsync(async (transaction) => {
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
  });
}