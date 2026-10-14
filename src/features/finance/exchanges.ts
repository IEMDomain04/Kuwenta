import { formatMoney } from './money';
import type { Account, Exchange, Transaction, TransactionDraft } from './types';
export const EXCHANGE_CATEGORIES = ['E-bank Cash-in', 'E-bank Cash-out', 'Service sale'] as const;
export function exchangeLabel(kind: Exchange['kind']): string { return kind === 'E-bank Cash-in' ? 'Cash-in (E-bank)' : kind === 'E-bank Cash-out' ? 'Cash-out (E-bank)' : kind === 'Service sale' ? 'Service exchange' : kind; }
export function exchangeKind(label: string): Exchange['kind'] | undefined { return EXCHANGE_CATEGORIES.find(kind => kind === label || exchangeLabel(kind) === label); }
export function validateExchange(draft: TransactionDraft): void {
  const e = draft.exchange;
  if (e && Object.keys(e).some(key=>!['kind','paid','received','receivedAccountId','extraAccountId','earningsConfirmed'].includes(key))) throw new Error('Unsupported exchange details.');
  if (!e || !EXCHANGE_CATEGORIES.includes(e.kind) || !Number.isSafeInteger(e.paid) || e.paid <= 0 || !Number.isSafeInteger(e.received) || e.received <= 0 || typeof e.earningsConfirmed !== 'boolean') throw new Error('Enter valid paid and received amounts.');
  if (!e.receivedAccountId?.trim() || e.receivedAccountId === draft.accountId) throw new Error('Choose a different receiving account.');
  if (![draft.accountId, e.receivedAccountId].includes(e.extraAccountId)) throw new Error('Choose which account pays the fee or receives earnings.');
  if (e.kind !== 'Service sale' && e.received > e.paid && !e.earningsConfirmed) throw new Error('Confirm that the difference is service earnings.');
  if (!(e.kind === 'Service sale' && draft.type === 'EXPENSE' && draft.category === 'Service sale') && (draft.type !== 'TRANSFER' || draft.category !== 'Transfer')) throw new Error('Invalid exchange record.');
}
export function exchangeDraft(accountId: string, exchange: Exchange, date: string, time: string, notes?: string): TransactionDraft {
  if (exchange.kind === 'Service sale') exchange = { ...exchange, extraAccountId: exchange.received > exchange.paid ? exchange.receivedAccountId : accountId, earningsConfirmed: true };
  const difference = exchange.received - exchange.paid;
  const principal = difference < 0 ? exchange.extraAccountId === accountId ? exchange.received : exchange.paid : exchange.extraAccountId === exchange.receivedAccountId ? exchange.paid : exchange.received;
  const draft: TransactionDraft = { type: 'TRANSFER', category: 'Transfer', amount: principal, accountId, destinationAccountId: exchange.receivedAccountId, transactionDate: date, transactionTime: time, notes, exchange };
  validateExchange(draft); return draft;
}
export function exchangeRecords(id: string, draft: TransactionDraft, createdAt: string, updatedAt = createdAt): Transaction[] {
  validateExchange(draft);
  const e = draft.exchange!;
  const legacy = e.kind === 'Service sale' && draft.type === 'EXPENSE';
  const expected = legacy ? { amount: e.paid, destinationAccountId: undefined } : exchangeDraft(draft.accountId,e,draft.transactionDate,draft.transactionTime,draft.notes);
  if (expected.amount !== draft.amount || expected.destinationAccountId !== draft.destinationAccountId) throw new Error('Exchange amounts do not match the movement.');
  const root: Transaction = { ...draft, id, createdAt, updatedAt };
  const difference = e.received - e.paid;
  if (!legacy && difference === 0) return [root];
  const child: Transaction = { id: id + ':extra', exchangeParentId: id, type: legacy || difference > 0 ? 'INCOME' : 'EXPENSE', accountId: legacy ? e.receivedAccountId : e.extraAccountId, amount: legacy ? e.received : Math.abs(difference), category: legacy ? 'Service sale' : difference > 0 ? 'Other Income' : 'Fees', transactionDate: draft.transactionDate, transactionTime: draft.transactionTime, notes: draft.notes, createdAt, updatedAt };
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


/** Convert old full-cost/full-receipt pairs without changing account balances or IDs. */
export function normalizeServiceExchanges(rows: readonly Transaction[], accounts: readonly Account[]): Transaction[] {
  validateExchangeLinks(rows);
  const replacements = new Map<string, Transaction[]>();
  for (const row of rows) {
    if (row.exchange?.kind !== 'Service sale' || row.type !== 'EXPENSE') continue;
    const draft = exchangeDraft(row.accountId, row.exchange, row.transactionDate, row.transactionTime, row.notes);
    const updated = exchangeRecords(row.id, draft, row.createdAt, row.updatedAt);
    updated[0].sourcePurpose = accounts.find(account => account.id === row.accountId)?.purpose;
    updated[0].destinationPurpose = accounts.find(account => account.id === row.exchange!.receivedAccountId)?.purpose;
    replacements.set(row.id, updated);
  }
  return rows.flatMap(row => replacements.get(row.id) ?? (row.exchangeParentId && replacements.has(row.exchangeParentId) ? [] : [row]));
}

export function groupExchangeTransactions(visible: readonly Transaction[], all: readonly Transaction[]): Transaction[] {
  const byId = new Map(all.map(row => [row.id, row]));
  const grouped = new Map<string, Transaction>();
  for (const row of visible) { const parent = row.exchangeParentId ? byId.get(row.exchangeParentId) : undefined; const item = parent ?? row; grouped.set(item.id, item); }
  return [...grouped.values()];
}

export function resolveTransactionId(rows: readonly Transaction[], requested: string | undefined): string | undefined {
  if (!requested) return undefined;
  const record = rows.find(row => row.id === requested);
  if (record) return record.exchangeParentId ?? record.id;
  // Equal-value exchanges no longer need an extra record after migration.
  const parent = requested.endsWith(':extra') ? rows.find(row => row.id === requested.slice(0, -6) && row.exchange) : undefined;
  return parent?.id ?? requested;
}

export function exchangeSummary(exchange: Exchange): string {
  const difference = exchange.received - exchange.paid;
  return difference === 0 ? formatMoney(exchange.paid, true) : formatMoney(Math.abs(difference), true) + (difference > 0 ? ' earnings' : exchange.kind === 'Service sale' ? ' loss' : ' fee');
}
