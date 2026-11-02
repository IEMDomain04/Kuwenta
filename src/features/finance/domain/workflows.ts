import type { Account, Transaction, TransactionDraft } from './types';
import { calculateAccountSummary, calculateFinanceSummary } from './calculations';
import { validateDraft } from './validation';

export function defaultEntryAccount(accounts: readonly Account[], context?: string, lastUsed?: string, destination?: string): string {
  if (context !== undefined) return context;
  const eligible = accounts.filter((account) => !account.archived && account.id !== destination);
  return eligible.find((account) => account.id === lastUsed)?.id ?? eligible[0]?.id ?? '';
}
/** Preview the replacement record when editing, rather than charging a transfer twice. */
export function previewTransfer(accounts: readonly Account[], transactions: readonly Transaction[], draft: TransactionDraft, original?: Transaction) {
  const source = accounts.find((account) => account.id === draft.accountId);
  const destination = accounts.find((account) => account.id === draft.destinationAccountId);
  if (draft.type !== 'TRANSFER' || !source || !destination) throw new Error('Choose both transfer accounts.');
  validateDraft(draft, source, destination);
  let previewId = 'transfer-preview';
  while (!original && transactions.some((row) => row.id === previewId)) previewId += '-';
  const candidate: Transaction = { ...draft, id: original?.id ?? previewId, createdAt: original?.createdAt ?? '2000-01-01T00:00:00.000Z', updatedAt: original?.updatedAt ?? '2000-01-01T00:00:00.000Z' };
  const updated = [...transactions.filter((row) => row.id !== candidate.id), candidate];
  calculateFinanceSummary(accounts, updated, draft.transactionDate.slice(0, 7));
  return {
    sourceBalance: calculateAccountSummary(source, updated, '1900-01').balance,
    destinationBalance: calculateAccountSummary(destination, updated, '1900-01').balance,
  };
}
