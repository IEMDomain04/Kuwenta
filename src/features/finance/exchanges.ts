import type { Exchange, Transaction, TransactionDraft } from './types';
export const EXCHANGE_CATEGORIES = ['E-bank Cash-in', 'E-bank Cash-out', 'Service sale'] as const;
export function exchangeLabel(kind: Exchange['kind']): string { return kind === 'E-bank Cash-in' ? 'Cash-in (E-bank)' : kind === 'E-bank Cash-out' ? 'Cash-out (E-bank)' : kind; }
export function exchangeKind(label: string): Exchange['kind'] | undefined { return EXCHANGE_CATEGORIES.find(kind => kind === label || exchangeLabel(kind) === label); }
export function validateExchange(draft: TransactionDraft): void {
  const e = draft.exchange;
  if (e && Object.keys(e).some(key=>!['kind','paid','received','receivedAccountId','extraAccountId','earningsConfirmed'].includes(key))) throw new Error('Unsupported exchange details.');
  if (!e || !EXCHANGE_CATEGORIES.includes(e.kind) || !Number.isSafeInteger(e.paid) || e.paid <= 0 || !Number.isSafeInteger(e.received) || e.received <= 0 || typeof e.earningsConfirmed !== 'boolean') throw new Error('Enter valid paid and received amounts.');
  if (!e.receivedAccountId?.trim() || e.receivedAccountId === draft.accountId) throw new Error('Choose a different receiving account.');
  if (![draft.accountId, e.receivedAccountId].includes(e.extraAccountId)) throw new Error('Choose which account pays the fee or receives earnings.');
  if (e.kind !== 'Service sale' && e.received > e.paid && !e.earningsConfirmed) throw new Error('Confirm that the difference is service earnings.');
  if (draft.type !== (e.kind === 'Service sale' ? 'EXPENSE' : 'TRANSFER') || draft.category !== (e.kind === 'Service sale' ? 'Service sale' : 'Transfer')) throw new Error('Invalid exchange record.');
}
export function exchangeDraft(accountId: string, exchange: Exchange, date: string, time: string, notes?: string): TransactionDraft {
  const difference = exchange.received - exchange.paid;
  const principal = difference < 0 ? exchange.extraAccountId === accountId ? exchange.received : exchange.paid : exchange.extraAccountId === exchange.receivedAccountId ? exchange.paid : exchange.received;
  const draft: TransactionDraft = { type: exchange.kind === 'Service sale' ? 'EXPENSE' : 'TRANSFER', category: exchange.kind === 'Service sale' ? 'Service sale' : 'Transfer', amount: exchange.kind === 'Service sale' ? exchange.paid : principal, accountId, destinationAccountId: exchange.kind === 'Service sale' ? undefined : exchange.receivedAccountId, transactionDate: date, transactionTime: time, notes, exchange };
  validateExchange(draft); return draft;
}
export function exchangeRecords(id: string, draft: TransactionDraft, createdAt: string, updatedAt = createdAt): Transaction[] {
  validateExchange(draft);
  const e = draft.exchange!;
  const expected = exchangeDraft(draft.accountId,e,draft.transactionDate,draft.transactionTime,draft.notes);
  if (expected.amount !== draft.amount || expected.destinationAccountId !== draft.destinationAccountId) throw new Error('Exchange amounts do not match the movement.');
  const root: Transaction = { ...draft, id, createdAt, updatedAt };
  const difference = e.received - e.paid;
  if (e.kind !== 'Service sale' && difference === 0) return [root];
  const child: Transaction = { id: id + ':extra', exchangeParentId: id, type: e.kind === 'Service sale' || difference > 0 ? 'INCOME' : 'EXPENSE', accountId: e.kind === 'Service sale' ? e.receivedAccountId : e.extraAccountId, amount: e.kind === 'Service sale' ? e.received : Math.abs(difference), category: e.kind === 'Service sale' ? 'Service sale' : difference > 0 ? 'Other Income' : 'Fees', transactionDate: draft.transactionDate, transactionTime: draft.transactionTime, notes: draft.notes, createdAt, updatedAt };
  return [root,child];
}
export function validateExchangeLinks(rows: readonly Transaction[]): void {
  const byId = new Map(rows.map(row=>[row.id,row]));
  const children = new Map<string, Transaction[]>();
  for (const row of rows) if (row.exchangeParentId) { const group=children.get(row.exchangeParentId) ?? []; group.push(row); children.set(row.exchangeParentId,group); }
  for (const row of rows) {
    if (row.exchangeParentId && (!byId.get(row.exchangeParentId)?.exchange || row.exchange)) throw new Error('An exchange is missing its linked record.');
    if (!row.exchange) continue;
    const expected = exchangeRecords(row.id,row as TransactionDraft,row.createdAt,row.updatedAt);
    const linked = children.get(row.id) ?? [];
    if (linked.length !== expected.length-1) throw new Error('Incomplete linked exchange.');
    for (const child of expected.slice(1)) {
      const actual = byId.get(child.id);
      if (!actual || ['type','accountId','amount','category','transactionDate','transactionTime','createdAt','updatedAt','exchangeParentId'].some(key=>actual[key as keyof Transaction]!==child[key as keyof Transaction])) throw new Error('Linked exchange records do not match.');
    }
  }
}
