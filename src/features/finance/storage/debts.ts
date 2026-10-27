import type { Debt, DebtAddition, DebtPayment, Transaction } from '../types';
import { calculateFinanceSummary } from '../calculations';
import { debtMovement, debtAdditionMovement, validateDebtRecords } from '../debts';
import type { FinanceDatabase } from './database';
import { listAccounts } from './accounts';
import { listTransactions } from './transactions';

export async function listDebts(db: FinanceDatabase): Promise<Debt[]> {
  return (await db.getAllAsync<Omit<Debt, 'existing'> & { existing: number }>('SELECT * FROM debts ORDER BY transactionDate DESC, createdAt DESC')).map(row => ({ ...row, existing: row.existing === 1 ? true : undefined, accountId: row.accountId ?? undefined, dueDate: row.dueDate ?? undefined, notes: row.notes ?? undefined }));
}
export async function listDebtPayments(db: FinanceDatabase): Promise<DebtPayment[]> {
  return (await db.getAllAsync<DebtPayment>('SELECT * FROM debt_payments ORDER BY transactionDate DESC, transactionTime DESC, createdAt DESC')).map(row => ({ ...row, notes: row.notes ?? undefined }));
}
export async function listDebtAdditions(db: FinanceDatabase): Promise<DebtAddition[]> {
  return (await db.getAllAsync<Omit<DebtAddition, 'existing'> & { existing: number }>('SELECT * FROM debt_additions ORDER BY transactionDate DESC, transactionTime DESC, createdAt DESC')).map(row => ({ ...row, existing: row.existing === 1 ? true : undefined, accountId: row.accountId ?? undefined, notes: row.notes ?? undefined }));
}
async function insertMovement(db: FinanceDatabase, row: Transaction) {
  await db.runAsync('INSERT INTO transactions(id,accountId,type,amount,category,transactionDate,transactionTime,notes,createdAt,updatedAt,adjustmentDirection,externalName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    row.id,row.accountId,row.type,row.amount,row.category,row.transactionDate,row.transactionTime,row.notes ?? null,row.createdAt,row.updatedAt,row.adjustmentDirection!,row.externalName!);
}
export async function createDebt(db: FinanceDatabase, debt: Debt) {
  await db.withExclusiveTransactionAsync(async tx => {
    const debts = await listDebts(tx), payments = await listDebtPayments(tx), additions = await listDebtAdditions(tx), rows = await listTransactions(tx), accounts = await listAccounts(tx);
    const existing = debts.find(row => row.id === debt.id);
    if (existing) {
      if (existing.name !== debt.name || existing.kind !== debt.kind || Boolean(existing.existing) !== Boolean(debt.existing) || existing.amount !== debt.amount || existing.accountId !== debt.accountId || existing.transactionDate !== debt.transactionDate || existing.transactionTime !== debt.transactionTime || existing.notes !== debt.notes || existing.dueDate !== debt.dueDate) throw new Error('Debt submission ID is already in use.');
      return;
    }
    if (rows.some(row => row.id === debt.id) || payments.some(row => row.id === debt.id) || additions.some(row => row.id === debt.id)) throw new Error('Submission ID is already in use.');
    if (!debt.existing && !accounts.some(row => row.id === debt.accountId && !row.archived)) throw new Error('Choose an active account.');
    const movements = debt.existing ? [] : [debtMovement(debt)];
    validateDebtRecords([...debts,debt],payments,accounts,[...rows,...movements],additions);
    calculateFinanceSummary(accounts,[...rows,...movements],debt.transactionDate.slice(0,7));
    for (const movement of movements) await insertMovement(tx,movement);
    await tx.runAsync('INSERT INTO debts(id,name,kind,amount,accountId,transactionDate,transactionTime,dueDate,notes,createdAt,updatedAt,existing) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',debt.id,debt.name,debt.kind,debt.amount,debt.accountId ?? null,debt.transactionDate,debt.transactionTime,debt.dueDate ?? null,debt.notes ?? null,debt.createdAt,debt.updatedAt,debt.existing ? 1 : 0);
  });
}
export async function recordDebtPayment(db: FinanceDatabase, payment: DebtPayment) {
  await db.withExclusiveTransactionAsync(async tx => {
    const debts = await listDebts(tx), payments = await listDebtPayments(tx), additions = await listDebtAdditions(tx), rows = await listTransactions(tx), accounts = await listAccounts(tx);
    const existing = payments.find(row => row.id === payment.id);
    if (existing) {
      if (existing.debtId !== payment.debtId || existing.amount !== payment.amount || existing.accountId !== payment.accountId || existing.transactionDate !== payment.transactionDate || existing.transactionTime !== payment.transactionTime || existing.notes !== payment.notes) throw new Error('Repayment submission ID is already in use.');
      return;
    }
    const debt = debts.find(row => row.id === payment.debtId); if (!debt) throw new Error('Debt no longer exists.');
    if (rows.some(row => row.id === payment.id) || debts.some(row => row.id === payment.id) || additions.some(row => row.id === payment.id)) throw new Error('Submission ID is already in use.');
    if (!accounts.some(row => row.id === payment.accountId && !row.archived)) throw new Error('Choose an active account.');
    const movement = debtMovement(debt,payment);
    validateDebtRecords(debts,[...payments,payment],accounts,[...rows,movement],additions);
    calculateFinanceSummary(accounts,[...rows,movement],payment.transactionDate.slice(0,7));
    await insertMovement(tx,movement);
    await tx.runAsync('INSERT INTO debt_payments(id,debtId,accountId,amount,transactionDate,transactionTime,notes,createdAt) VALUES (?,?,?,?,?,?,?,?)',payment.id,payment.debtId,payment.accountId,payment.amount,payment.transactionDate,payment.transactionTime,payment.notes ?? null,payment.createdAt);
  });
}
export async function removeDebtRecord(db: FinanceDatabase, id: string, repayment = false) {
  await db.withExclusiveTransactionAsync(async tx => {
    const debt = await tx.getFirstAsync<{ id: string; existing?: number }>('SELECT * FROM '+(repayment ? 'debt_payments' : 'debts')+' WHERE id = ?',id);
    if (!debt) throw new Error('Debt record no longer exists.');
    if (repayment) { await tx.runAsync('DELETE FROM debt_payments WHERE id = ?',id); await tx.runAsync('DELETE FROM transactions WHERE id = ?',id); }
    else {
      const additions = await listDebtAdditions(tx);
      await tx.runAsync('DELETE FROM debt_additions WHERE debtId = ?',id);
      const payments = await tx.getAllAsync<{id:string}>('SELECT id FROM debt_payments WHERE debtId = ?',id);
      await tx.runAsync('DELETE FROM debt_payments WHERE debtId = ?',id);
      await tx.runAsync('DELETE FROM debts WHERE id = ?',id);
      for (const payment of payments) await tx.runAsync('DELETE FROM transactions WHERE id = ?',payment.id);
      for (const addition of additions.filter(row => row.debtId === id && !row.existing)) await tx.runAsync('DELETE FROM transactions WHERE id = ?',addition.id);
      if (!debt.existing) await tx.runAsync('DELETE FROM transactions WHERE id = ?',id);
    }
    calculateFinanceSummary(await listAccounts(tx),await listTransactions(tx),'1900-01');
  });
}

export async function recordDebtAddition(db: FinanceDatabase, addition: DebtAddition) {
  await db.withExclusiveTransactionAsync(async tx => {
    const debts = await listDebts(tx), payments = await listDebtPayments(tx), additions = await listDebtAdditions(tx), rows = await listTransactions(tx), accounts = await listAccounts(tx);
    const existing = additions.find(row => row.id === addition.id);
    if (existing) {
      if (existing.debtId !== addition.debtId || existing.amount !== addition.amount || existing.accountId !== addition.accountId || Boolean(existing.existing) !== Boolean(addition.existing) || existing.transactionDate !== addition.transactionDate || existing.transactionTime !== addition.transactionTime || existing.notes !== addition.notes) throw new Error('Borrowing submission ID is already in use.');
      return;
    }
    const debt = debts.find(row => row.id === addition.debtId);
    if (!debt) throw new Error('Debt no longer exists.');
    if (rows.some(row => row.id === addition.id) || debts.some(row => row.id === addition.id) || payments.some(row => row.id === addition.id)) throw new Error('Submission ID is already in use.');
    if (!addition.existing && !accounts.some(row => row.id === addition.accountId && !row.archived)) throw new Error('Choose an active account.');
    const movements = addition.existing ? [] : [debtAdditionMovement(debt, addition)];
    validateDebtRecords(debts, payments, accounts, [...rows,...movements], [...additions,addition]);
    calculateFinanceSummary(accounts,[...rows,...movements],addition.transactionDate.slice(0,7));
    for (const movement of movements) await insertMovement(tx,movement);
    await tx.runAsync('INSERT INTO debt_additions(id,debtId,accountId,existing,amount,transactionDate,transactionTime,notes,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',addition.id,addition.debtId,addition.accountId ?? null,addition.existing ? 1 : 0,addition.amount,addition.transactionDate,addition.transactionTime,addition.notes ?? null,addition.createdAt);
  });
}

/** Correct the original entry; later borrowing and repayment records remain unchanged. */
export async function correctDebtAmount(db: FinanceDatabase, id: string, amount: number, expectedAmount: number) {
  await db.withExclusiveTransactionAsync(async tx => {
    const debts = await listDebts(tx), payments = await listDebtPayments(tx), additions = await listDebtAdditions(tx), rows = await listTransactions(tx), accounts = await listAccounts(tx);
    const original = debts.find(row => row.id === id);
    if (!original) throw new Error('Debt no longer exists.');
    if (original.amount !== expectedAmount) throw new Error('This debt changed. Reopen it before editing.');
    if (original.amount === amount) return;
    const debt = { ...original, amount, updatedAt: new Date().toISOString() };
    const movement = debt.existing ? undefined : debtMovement(debt);
    const nextRows = rows.map(row => row.id === id && movement ? movement : row);
    validateDebtRecords(debts.map(row => row.id === id ? debt : row),payments,accounts,nextRows,additions);
    calculateFinanceSummary(accounts,nextRows,debt.transactionDate.slice(0,7));
    if (movement) await tx.runAsync('UPDATE transactions SET amount = ?, updatedAt = ? WHERE id = ?',amount,debt.updatedAt,id);
    await tx.runAsync('UPDATE debts SET amount = ?, updatedAt = ? WHERE id = ?',amount,debt.updatedAt,id);
  });
}

export async function removeDebtAddition(db: FinanceDatabase, id: string) {
  await db.withExclusiveTransactionAsync(async tx => {
    const debts = await listDebts(tx), payments = await listDebtPayments(tx), additions = await listDebtAdditions(tx), rows = await listTransactions(tx), accounts = await listAccounts(tx);
    const addition = additions.find(row => row.id === id);
    if (!addition) throw new Error('Borrowing record no longer exists.');
    const nextRows = addition.existing ? rows : rows.filter(row => row.id !== id);
    validateDebtRecords(debts,payments,accounts,nextRows,additions.filter(row => row.id !== id));
    calculateFinanceSummary(accounts,nextRows,'1900-01');
    await tx.runAsync('DELETE FROM debt_additions WHERE id = ?',id);
    if (!addition.existing) await tx.runAsync('DELETE FROM transactions WHERE id = ?',id);
  });
}
