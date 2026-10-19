import type { Debt, DebtPayment, Transaction } from '../types';
import { calculateFinanceSummary } from '../calculations';
import { debtMovement, validateDebtRecords } from '../debts';
import type { FinanceDatabase } from './database';
import { listAccounts } from './accounts';
import { listTransactions } from './transactions';

export async function listDebts(db: FinanceDatabase): Promise<Debt[]> {
  return (await db.getAllAsync<Omit<Debt, 'existing'> & { existing: number }>('SELECT * FROM debts ORDER BY transactionDate DESC, createdAt DESC')).map(row => ({ ...row, existing: row.existing === 1 ? true : undefined, accountId: row.accountId ?? undefined, dueDate: row.dueDate ?? undefined, notes: row.notes ?? undefined }));
}
export async function listDebtPayments(db: FinanceDatabase): Promise<DebtPayment[]> {
  return (await db.getAllAsync<DebtPayment>('SELECT * FROM debt_payments ORDER BY transactionDate DESC, transactionTime DESC, createdAt DESC')).map(row => ({ ...row, notes: row.notes ?? undefined }));
}
async function insertMovement(db: FinanceDatabase, row: Transaction) {
  await db.runAsync('INSERT INTO transactions(id,accountId,type,amount,category,transactionDate,transactionTime,notes,createdAt,updatedAt,adjustmentDirection,externalName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    row.id,row.accountId,row.type,row.amount,row.category,row.transactionDate,row.transactionTime,row.notes ?? null,row.createdAt,row.updatedAt,row.adjustmentDirection!,row.externalName!);
}
export async function createDebt(db: FinanceDatabase, debt: Debt) {
  await db.withExclusiveTransactionAsync(async tx => {
    const debts = await listDebts(tx), payments = await listDebtPayments(tx), rows = await listTransactions(tx), accounts = await listAccounts(tx);
    const existing = debts.find(row => row.id === debt.id);
    if (existing) {
      if (existing.name !== debt.name || existing.kind !== debt.kind || Boolean(existing.existing) !== Boolean(debt.existing) || existing.amount !== debt.amount || existing.accountId !== debt.accountId || existing.transactionDate !== debt.transactionDate || existing.transactionTime !== debt.transactionTime || existing.notes !== debt.notes || existing.dueDate !== debt.dueDate) throw new Error('Debt submission ID is already in use.');
      return;
    }
    if (rows.some(row => row.id === debt.id)) throw new Error('Submission ID is already in use.');
    if (!debt.existing && !accounts.some(row => row.id === debt.accountId && !row.archived)) throw new Error('Choose an active account.');
    const movements = debt.existing ? [] : [debtMovement(debt)];
    validateDebtRecords([...debts,debt],payments,accounts,[...rows,...movements]);
    calculateFinanceSummary(accounts,[...rows,...movements],debt.transactionDate.slice(0,7));
    for (const movement of movements) await insertMovement(tx,movement);
    await tx.runAsync('INSERT INTO debts(id,name,kind,amount,accountId,transactionDate,transactionTime,dueDate,notes,createdAt,updatedAt,existing) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',debt.id,debt.name,debt.kind,debt.amount,debt.accountId ?? null,debt.transactionDate,debt.transactionTime,debt.dueDate ?? null,debt.notes ?? null,debt.createdAt,debt.updatedAt,debt.existing ? 1 : 0);
  });
}
export async function recordDebtPayment(db: FinanceDatabase, payment: DebtPayment) {
  await db.withExclusiveTransactionAsync(async tx => {
    const debts = await listDebts(tx), payments = await listDebtPayments(tx), rows = await listTransactions(tx), accounts = await listAccounts(tx);
    const existing = payments.find(row => row.id === payment.id);
    if (existing) {
      if (existing.debtId !== payment.debtId || existing.amount !== payment.amount || existing.accountId !== payment.accountId || existing.transactionDate !== payment.transactionDate || existing.transactionTime !== payment.transactionTime || existing.notes !== payment.notes) throw new Error('Repayment submission ID is already in use.');
      return;
    }
    const debt = debts.find(row => row.id === payment.debtId); if (!debt) throw new Error('Debt no longer exists.');
    if (rows.some(row => row.id === payment.id)) throw new Error('Submission ID is already in use.');
    if (!accounts.some(row => row.id === payment.accountId && !row.archived)) throw new Error('Choose an active account.');
    const movement = debtMovement(debt,payment);
    validateDebtRecords(debts,[...payments,payment],accounts,[...rows,movement]);
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
      const payments = await tx.getAllAsync<{id:string}>('SELECT id FROM debt_payments WHERE debtId = ?',id);
      await tx.runAsync('DELETE FROM debt_payments WHERE debtId = ?',id);
      await tx.runAsync('DELETE FROM debts WHERE id = ?',id);
      for (const payment of payments) await tx.runAsync('DELETE FROM transactions WHERE id = ?',payment.id);
      if (!debt.existing) await tx.runAsync('DELETE FROM transactions WHERE id = ?',id);
    }
    calculateFinanceSummary(await listAccounts(tx),await listTransactions(tx),'1900-01');
  });
}
