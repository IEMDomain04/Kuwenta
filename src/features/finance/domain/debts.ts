import type { Account, Debt, DebtAddition, DebtPayment, Transaction } from './types';
import { isValidDate, isValidTime, isUtcTimestamp } from './dates';


export function debtProgress(debt: Debt, payments: readonly DebtPayment[], additions: readonly DebtAddition[] = []) {
  const added = additions.filter(row => row.debtId === debt.id).reduce((sum, row) => sum + BigInt(row.amount), 0n);
  const total = BigInt(debt.amount) + added;
  const paid = payments.filter(row => row.debtId === debt.id).reduce((sum, row) => sum + BigInt(row.amount), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Debt total exceeds the supported range.');
  if (paid < 0n || paid > total) throw new Error('Repayments cannot exceed the total borrowed amount.');
  return { added: Number(added), totalBorrowed: Number(total), paid: Number(paid), remaining: Number(total - paid), settled: paid === total };
}
export function debtTotals(debts: readonly Debt[], payments: readonly DebtPayment[], additions: readonly DebtAddition[] = []) {
  let owe = 0n, owed = 0n;
  for (const debt of debts) { const remaining = BigInt(debtProgress(debt, payments, additions).remaining); if (debt.kind === 'owe') owe += remaining; else owed += remaining; }
  if (owe > BigInt(Number.MAX_SAFE_INTEGER) || owed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Debt total exceeds the supported range.');
  return { owe: Number(owe), owed: Number(owed) };
}
export function debtMovement(debt: Debt, payment?: DebtPayment): Transaction {
  if (!payment && debt.existing) throw new Error('Existing debts do not move money when added.');
  const row = payment ?? debt;
  if (!row.accountId) throw new Error('Choose an account.');
  return { id: row.id, accountId: row.accountId, amount: row.amount, type: 'EXTERNAL', category: 'External transfer',
    adjustmentDirection: (debt.kind === 'owe') !== Boolean(payment) ? 'increase' : 'decrease', externalName: debt.name,
    transactionDate: row.transactionDate, transactionTime: row.transactionTime, notes: row.notes,
    createdAt: row.createdAt, updatedAt: payment ? row.createdAt : debt.updatedAt };
}
export function debtAdditionMovement(debt: Debt, addition: DebtAddition): Transaction {
  return debtMovement({ ...debt, ...addition, existing: addition.existing, updatedAt: addition.createdAt });
}
function validateEntry(row: Pick<Debt, 'id' | 'amount' | 'accountId' | 'transactionDate' | 'transactionTime' | 'createdAt' | 'notes'>, accounts: readonly Account[], requiresAccount = true) {
  if (typeof row.id !== 'string' || !row.id.trim()) throw new Error('Debt record ID is required.');
  if (!Number.isSafeInteger(row.amount) || row.amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (requiresAccount && !accounts.some(account => account.id === row.accountId)) throw new Error('Choose an account.');
  if (!isValidDate(row.transactionDate) || !isValidTime(row.transactionTime) || !isUtcTimestamp(row.createdAt)) throw new Error('Choose a valid date and time.');
  if (row.notes !== undefined && typeof row.notes !== 'string') throw new Error('Enter a valid note.');
}
export function validateDebtRecords(debts: readonly Debt[], payments: readonly DebtPayment[], accounts: readonly Account[], transactions: readonly Transaction[], additions: readonly DebtAddition[] = []) {
  const ids = new Set<string>();
  const movementById = new Map(transactions.map(row => [row.id, row]));
  function checkMovement(debt: Debt, payment?: DebtPayment) {
    const id = payment?.id ?? debt.id;
    if (ids.has(id)) throw new Error('Duplicate debt record ID.'); ids.add(id);
    if (!payment && debt.existing) {
      if (movementById.has(id)) throw new Error('Existing debt must not have an initial money movement.');
      return;
    }
    const expected = debtMovement(debt, payment), actual = movementById.get(expected.id);
    if (!actual || actual.type !== 'EXTERNAL' || actual.amount !== expected.amount || actual.accountId !== expected.accountId || actual.adjustmentDirection !== expected.adjustmentDirection || actual.externalName !== expected.externalName || actual.transactionDate !== expected.transactionDate || actual.transactionTime !== expected.transactionTime || actual.notes !== expected.notes || actual.createdAt !== expected.createdAt || actual.updatedAt !== expected.updatedAt) throw new Error('Debt movement does not match its record.');
  }
  const byId = new Map<string, Debt>();
  for (const debt of debts) {
    if (debt.existing !== undefined && typeof debt.existing !== 'boolean') throw new Error('Choose how to record this debt.');
    if (debt.existing && debt.accountId !== undefined) throw new Error('An existing debt does not need an account until repayment.');
    validateEntry(debt, accounts, !debt.existing);
    if (typeof debt.name !== 'string' || !debt.name.trim()) throw new Error("Enter the person's name.");
    if (debt.kind !== 'owe' && debt.kind !== 'owed') throw new Error('Choose I owe or Owed to me.');
    if (!isUtcTimestamp(debt.updatedAt) || debt.updatedAt < debt.createdAt) throw new Error('Invalid debt timestamp.');
    if (debt.dueDate !== undefined && (!isValidDate(debt.dueDate) || debt.dueDate < debt.transactionDate)) throw new Error('Due date must be on or after the loan date.');
    checkMovement(debt); byId.set(debt.id, debt);
  }
  for (const addition of additions) {
    const debt = byId.get(addition.debtId);
    if (!debt) throw new Error('Additional borrowing references an unknown debt.');
    if (addition.existing !== undefined && typeof addition.existing !== 'boolean') throw new Error('Choose how to record this borrowing.');
    if (addition.existing && addition.accountId !== undefined) throw new Error('An existing borrowing does not need an account.');
    validateEntry(addition, accounts, !addition.existing);
    if (addition.transactionDate + addition.transactionTime < debt.transactionDate + debt.transactionTime) throw new Error('Additional borrowing cannot be before the original debt.');
    checkMovement({ ...debt, ...addition, existing: addition.existing, updatedAt: addition.createdAt });
  }
  for (const payment of payments) {
    validateEntry(payment, accounts);
    const debt = byId.get(payment.debtId);
    if (!debt) throw new Error('Repayment references an unknown debt.');
    if (payment.transactionDate + payment.transactionTime < debt.transactionDate + debt.transactionTime) throw new Error('Repayment cannot be before the loan.');
    checkMovement(debt, payment);
  }
  debtTotals(debts, payments, additions);
  // Borrowing must already exist at the time of each repayment.
  for (const debt of debts) {
    const events = [
      ...additions.filter(row => row.debtId === debt.id).map(row => ({ at: row.transactionDate + row.transactionTime, amount: row.amount, payment: false })),
      ...payments.filter(row => row.debtId === debt.id).map(row => ({ at: row.transactionDate + row.transactionTime, amount: row.amount, payment: true })),
    ].sort((a,b) => a.at.localeCompare(b.at) || Number(a.payment) - Number(b.payment));
    let remaining = BigInt(debt.amount);
    for (const event of events) {
      remaining += BigInt(event.amount) * (event.payment ? -1n : 1n);
      if (remaining < 0n) throw new Error('Repayment exceeds the amount borrowed on that date.');
    }
  }
}
