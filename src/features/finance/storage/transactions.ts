import type { Transaction, TransactionDraft } from '../types';
import { validateDraft, validateManualRecord } from '../validation';
import { getCashAccount } from './accounts';
import type { FinanceDatabase } from './database';

type TransactionRow = Omit<Transaction, 'notes' | 'destinationAccountId' | 'adjustmentDirection'> & {
  notes: string | null; destinationAccountId: string | null;
  adjustmentDirection: 'increase' | 'decrease' | null;
};
function fromRow(row: TransactionRow): Transaction {
  const record: Transaction = { ...row, notes: row.notes ?? undefined,
    destinationAccountId: row.destinationAccountId ?? undefined,
    adjustmentDirection: row.adjustmentDirection ?? undefined };
  validateManualRecord(record);
  return record;
}
function validateId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Transaction ID is required.');
}

/** Generate once when starting a submission; reuse this ID for every Save retry. */
export async function createTransactionId(db: FinanceDatabase): Promise<string> {
  const row = await db.getFirstAsync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id');
  if (!row) throw new Error('Could not generate a transaction ID.');
  return row.id;
}

export async function getTransaction(db: FinanceDatabase, id: string): Promise<Transaction | null> {
  validateId(id);
  const row = await db.getFirstAsync<TransactionRow>('SELECT * FROM transactions WHERE id = ? AND accountId = ?', id, 'cash');
  return row ? fromRow(row) : null;
}

export async function listTransactions(db: FinanceDatabase): Promise<Transaction[]> {
  const rows = await db.getAllAsync<TransactionRow>(`SELECT * FROM transactions WHERE accountId = ?
    ORDER BY transactionDate DESC, transactionTime DESC, createdAt DESC, id DESC`, 'cash');
  return rows.map(fromRow);
}

/** Retries return the existing record and never overwrite it, even after an edit. */
export async function createTransaction(db: FinanceDatabase, id: string, draft: TransactionDraft): Promise<Transaction> {
  validateId(id);
  let saved: Transaction | undefined;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    validateDraft(draft, await getCashAccount(transaction));
    const now = new Date().toISOString();
    await transaction.runAsync(`INSERT INTO transactions
      (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      id, draft.accountId, draft.type, draft.amount, draft.category, draft.transactionDate,
      draft.transactionTime, draft.notes ?? null, now, now);
    saved = await getTransaction(transaction, id) ?? undefined;
    if (!saved) throw new Error('Could not retrieve the saved transaction.');
  });
  return saved!;
}

/** Call only after the user confirms. The original record remains unchanged on failure. */
export async function updateTransaction(db: FinanceDatabase, id: string, draft: TransactionDraft): Promise<Transaction> {
  validateId(id);
  let saved: Transaction | undefined;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    validateDraft(draft, await getCashAccount(transaction));
    const original = await getTransaction(transaction, id);
    if (!original) throw new Error('Transaction no longer exists.');
    // Preserve valid audit ordering if the device clock has moved backwards.
    const updatedAt = [new Date().toISOString(), original.updatedAt].sort().at(-1)!;
    await transaction.runAsync(`UPDATE transactions SET type = ?, amount = ?, category = ?,
      transactionDate = ?, transactionTime = ?, notes = ?, updatedAt = ? WHERE id = ? AND accountId = ?`,
      draft.type, draft.amount, draft.category, draft.transactionDate, draft.transactionTime,
      draft.notes ?? null, updatedAt, id, 'cash');
    saved = await getTransaction(transaction, id) ?? undefined;
    if (!saved) throw new Error('Could not retrieve the updated transaction.');
  });
  return saved!;
}

/** Call after deletion confirmation, or for the explicit Undo of a creation. */
export async function deleteTransaction(db: FinanceDatabase, id: string): Promise<void> {
  validateId(id);
  await db.runAsync('DELETE FROM transactions WHERE id = ? AND accountId = ?', id, 'cash');
}
