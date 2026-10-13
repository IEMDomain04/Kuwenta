import { validateExchange } from './exchanges';
import { isAccountIcon } from './account-icons';
import { ACCOUNT_CARD_COLORS } from './account-colors';
import { isUtcTimestamp, isValidDate, isValidTime } from './dates';
import { CATEGORIES, LEGACY_EXPENSE_CATEGORIES, type Account, type Transaction, type TransactionDraft, type SavingsGoal } from './types';

export function validateAccount(account: Account): void {
  if (!account.name?.trim()) throw new Error('Enter an account name.');
  if (!account.id?.trim()) throw new Error('Could not identify this account. Try again.');
  if (account.icon !== undefined && !isAccountIcon(account.icon)) throw new Error('Choose a valid account icon.');
  if (account.color !== undefined && (typeof account.color !== 'string' || !Object.hasOwn(ACCOUNT_CARD_COLORS, account.color))) throw new Error('Choose a valid account color.');
  if (account.currency !== 'PHP') throw new Error('Only PHP accounts are supported.');
  if (!Number.isSafeInteger(account.openingBalance)) throw new Error('Opening balance must be safe integer centavos.');
  if (!['spending', 'savings'].includes(account.purpose)) throw new Error('Invalid account purpose.');
  if (typeof account.includedInAvailable !== 'boolean' || typeof account.archived !== 'boolean') {
    throw new Error('Account flags must be booleans.');
  }
}

/** Field validation is shared by drafts and already-stored manual records. */
export function validateTransactionFields(draft: TransactionDraft): void {
  if (draft.type !== 'INCOME' && draft.type !== 'EXPENSE' && draft.type !== 'TRANSFER') throw new Error('Choose income, expense or transfer.');
  if (!Number.isSafeInteger(draft.amount) || draft.amount <= 0) throw new Error('Amount must be positive safe integer centavos.');
  if (!draft.accountId?.trim()) throw new Error('An account is required.');
  if (draft.type === 'TRANSFER') {
    if (draft.category !== 'Transfer' || typeof draft.destinationAccountId !== 'string' || !draft.destinationAccountId.trim() || draft.destinationAccountId === draft.accountId) throw new Error('Choose two different accounts for the transfer.');
  } else if (draft.destinationAccountId !== undefined) throw new Error('Only transfers can have a destination account.');
  if (draft.type !== 'TRANSFER' && !(CATEGORIES[draft.type] as readonly string[]).includes(draft.category) && !(draft.type === 'EXPENSE' && LEGACY_EXPENSE_CATEGORIES.includes(draft.category))) throw new Error('Choose a category for this transaction type.');
  if (draft.exchange !== undefined) validateExchange(draft);
  if (!isValidDate(draft.transactionDate)) throw new Error('Enter a valid Philippine date as YYYY-MM-DD.');
  if (!isValidTime(draft.transactionTime)) throw new Error('Enter a valid time as HH:mm:ss.');
  if (draft.notes !== undefined && typeof draft.notes !== 'string') throw new Error('Notes must be text.');
}

export function validateDraft(draft: TransactionDraft, account: Account, destination?: Account): void {
  validateAccount(account);
  validateTransactionFields(draft);
  if (draft.accountId !== account.id) throw new Error('The selected account does not exist.');
  if (draft.type === 'TRANSFER') {
    if (!destination || destination.id !== draft.destinationAccountId) throw new Error('Choose a destination account.');
    validateAccount(destination);
    if (destination.archived) throw new Error('Cannot transfer to an archived account.');
  }
  if (account.archived) throw new Error('Cannot save to an archived account.');
}

/** Stored income, expenses and explicit balance adjustments. Transfers move money between two accounts. */
export function validateManualRecord(record: Transaction): void {
  if (record.type === 'ADJUSTMENT' || record.type === 'EXTERNAL') {
    if (record.category !== (record.type === 'EXTERNAL' ? 'External transfer' : 'Balance adjustment') || !['increase', 'decrease'].includes(record.adjustmentDirection ?? '')) throw new Error('Invalid balance adjustment.');
    validateTransactionFields({ ...record, type: 'EXPENSE', category: 'Other' });
  } else {
    if (record.type !== 'INCOME' && record.type !== 'EXPENSE' && record.type !== 'TRANSFER') throw new Error('Unsupported transaction type.');
    validateTransactionFields({ ...record, type: record.type });
    if (record.adjustmentDirection !== undefined) throw new Error('Income and expenses cannot contain adjustment fields.');
  }
  if (record.type === 'EXTERNAL' ? typeof record.externalName !== 'string' || !record.externalName.trim() : record.externalName !== undefined) throw new Error('Invalid external transfer name.');
  const purposes = ['spending', 'savings'];
  if (record.type === 'TRANSFER') {
    if ((record.sourcePurpose === undefined) !== (record.destinationPurpose === undefined)
      || record.sourcePurpose !== undefined && (!purposes.includes(record.sourcePurpose) || !purposes.includes(record.destinationPurpose!))) throw new Error('Invalid transfer account purposes.');
  } else if (record.sourcePurpose !== undefined || record.destinationPurpose !== undefined) throw new Error('Only transfers can contain account purposes.');
  if (record.exchangeParentId !== undefined && (typeof record.exchangeParentId !== 'string' || !record.exchangeParentId.trim() || record.exchangeParentId === record.id || record.exchange)) throw new Error('Invalid linked exchange.');
  if (!record.id?.trim()) throw new Error('Transaction ID is required.');
  if (!isUtcTimestamp(record.createdAt) || !isUtcTimestamp(record.updatedAt)) throw new Error('Record timestamps must be ISO UTC timestamps.');
  if (record.updatedAt < record.createdAt) throw new Error('Update timestamp cannot precede creation.');
  if (record.type !== 'TRANSFER' && record.destinationAccountId !== undefined) throw new Error('Only transfers can have a destination account.');
}
export function validateGoal(goal: SavingsGoal, accounts: readonly Account[]): void {
  if (typeof goal.id !== 'string' || !goal.id.trim() || typeof goal.name !== 'string' || !goal.name.trim()) throw new Error('Goal name is required.');
  if (!Number.isSafeInteger(goal.targetAmount) || goal.targetAmount <= 0) throw new Error('Goal target must be positive integer centavos.');
  const account = accounts.find((row) => row.id === goal.accountId);
  if (!account || account.purpose !== 'savings') throw new Error('Choose a savings account for this goal.');
  if (goal.targetDate !== undefined && !isValidDate(goal.targetDate)) throw new Error('Enter a valid target date as YYYY-MM-DD.');
  if (!isUtcTimestamp(goal.createdAt) || !isUtcTimestamp(goal.updatedAt) || goal.updatedAt < goal.createdAt) throw new Error('Invalid goal timestamps.');
}
