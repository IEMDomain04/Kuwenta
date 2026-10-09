import { isUtcTimestamp, isValidDate, isValidTime } from './dates';
import { CATEGORIES, type Account, type Transaction, type TransactionDraft } from './types';

export function validateAccount(account: Account): void {
  if (!account.id?.trim() || !account.name?.trim()) throw new Error('Account ID and name are required.');
  if (account.currency !== 'PHP') throw new Error('Only PHP accounts are supported.');
  if (!Number.isSafeInteger(account.openingBalance)) throw new Error('Opening balance must be safe integer centavos.');
  if (!['spending', 'savings'].includes(account.purpose)) throw new Error('Invalid account purpose.');
  if (typeof account.includedInAvailable !== 'boolean' || typeof account.archived !== 'boolean') {
    throw new Error('Account flags must be booleans.');
  }
}

/** Field validation is shared by drafts and already-stored manual records. */
export function validateTransactionFields(draft: TransactionDraft): void {
  if (draft.type !== 'INCOME' && draft.type !== 'EXPENSE') throw new Error('Choose income or expense.');
  if (!Number.isSafeInteger(draft.amount) || draft.amount <= 0) throw new Error('Amount must be positive safe integer centavos.');
  if (!draft.accountId?.trim()) throw new Error('An account is required.');
  if (!(CATEGORIES[draft.type] as readonly string[]).includes(draft.category)) throw new Error('Choose a category for this transaction type.');
  if (!isValidDate(draft.transactionDate)) throw new Error('Enter a valid Philippine date as YYYY-MM-DD.');
  if (!isValidTime(draft.transactionTime)) throw new Error('Enter a valid Philippine time as HH:mm:ss.');
  if (draft.notes !== undefined && typeof draft.notes !== 'string') throw new Error('Notes must be text.');
}

export function validateDraft(draft: TransactionDraft, account: Account): void {
  validateAccount(account);
  validateTransactionFields(draft);
  if (draft.accountId !== account.id) throw new Error('The selected account does not exist.');
  if (account.archived) throw new Error('Cannot save to an archived account.');
}

/** Future types are represented in the model but cannot enter MVP calculations. */
export function validateManualRecord(record: Transaction): void {
  if (record.type !== 'INCOME' && record.type !== 'EXPENSE') throw new Error('Transfers and adjustments are not enabled yet.');
  validateTransactionFields({ ...record, type: record.type });
  if (!record.id?.trim()) throw new Error('Transaction ID is required.');
  if (!isUtcTimestamp(record.createdAt) || !isUtcTimestamp(record.updatedAt)) throw new Error('Record timestamps must be ISO UTC timestamps.');
  if (record.updatedAt < record.createdAt) throw new Error('Update timestamp cannot precede creation.');
  if (record.destinationAccountId !== undefined || record.adjustmentDirection !== undefined) {
    throw new Error('Manual transactions cannot contain transfer or adjustment fields.');
  }
}
