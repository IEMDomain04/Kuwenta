import { listDebts, listDebtPayments, listDebtAdditions } from './debts';
import { listBudgets } from './budgets';
import { parseBackup, serializeBackup, type FinanceBackup } from '../backup';
import { listAccounts } from './accounts';
import { listGoals } from './goals';
import { listTransactions } from './transactions';
import type { FinanceDatabase } from './database';

/** Both tables are read in one transaction for a consistent snapshot. */
export async function readBackupJson(db: FinanceDatabase): Promise<string> {
  let json: string | undefined;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    json = serializeBackup(await listAccounts(transaction), await listTransactions(transaction), new Date().toISOString(), await listGoals(transaction), await listBudgets(transaction), await listDebts(transaction), await listDebtPayments(transaction), await listDebtAdditions(transaction));
  });
  if (json === undefined) throw new Error('Could not read financial records for backup.');
  return json;
}
/** Explicit replacement only after UI confirmation. Any failure rolls back all accounts and records. */
export async function restoreBackup(db: FinanceDatabase, backup: FinanceBackup, needsSetup = false): Promise<void> {
  const validated = parseBackup(JSON.stringify(backup));
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM debt_additions');
    await transaction.runAsync('DELETE FROM debt_payments');
    await transaction.runAsync('DELETE FROM debts');
    await transaction.runAsync('DELETE FROM preferences');
    await transaction.runAsync("INSERT INTO preferences(key, value) VALUES ('cashSetupComplete', ?)", needsSetup ? '0' : '1');
    await transaction.runAsync('DELETE FROM budgets');
    await transaction.runAsync('DELETE FROM goals');
    await transaction.runAsync('DELETE FROM transactions');
    await transaction.runAsync('DELETE FROM accounts');
    for (const account of validated.accounts) {
      await transaction.runAsync('INSERT INTO accounts (id, name, currency, openingBalance, purpose, includedInAvailable, archived, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        account.id, account.name, account.currency, account.openingBalance, account.purpose, account.includedInAvailable ? 1 : 0, account.archived ? 1 : 0, account.color ?? null, account.icon ?? null);
    }
    for (const record of [...validated.transactions].sort((a,b)=>Number(Boolean(a.exchangeParentId))-Number(Boolean(b.exchangeParentId)))) {
      await transaction.runAsync('INSERT INTO transactions (id, accountId, type, amount, category, transactionDate, transactionTime, notes, createdAt, updatedAt, adjustmentDirection, destinationAccountId, sourcePurpose, destinationPurpose, externalName, exchange, exchangeParentId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        record.id, record.accountId, record.type, record.amount, record.category, record.transactionDate, record.transactionTime, record.notes ?? null, record.createdAt, record.updatedAt, record.adjustmentDirection ?? null, record.destinationAccountId ?? null, record.sourcePurpose ?? null, record.destinationPurpose ?? null, record.externalName ?? null, record.exchange ? JSON.stringify(record.exchange) : null, record.exchangeParentId ?? null);
    }
    for (const budget of validated.budgets ?? []) await transaction.runAsync('INSERT INTO budgets(month, category, limitAmount) VALUES (?, ?, ?)', budget.month, budget.category, budget.limitAmount);
    for (const debt of validated.debts ?? []) await transaction.runAsync('INSERT INTO debts(id,name,kind,amount,accountId,transactionDate,transactionTime,dueDate,notes,createdAt,updatedAt,existing) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',debt.id,debt.name,debt.kind,debt.amount,debt.accountId ?? null,debt.transactionDate,debt.transactionTime,debt.dueDate ?? null,debt.notes ?? null,debt.createdAt,debt.updatedAt,debt.existing ? 1 : 0);
    for (const payment of validated.debtPayments ?? []) await transaction.runAsync('INSERT INTO debt_payments(id,debtId,accountId,amount,transactionDate,transactionTime,notes,createdAt) VALUES (?,?,?,?,?,?,?,?)',payment.id,payment.debtId,payment.accountId,payment.amount,payment.transactionDate,payment.transactionTime,payment.notes ?? null,payment.createdAt);
    for (const addition of validated.debtAdditions ?? []) await transaction.runAsync('INSERT INTO debt_additions(id,debtId,accountId,existing,amount,transactionDate,transactionTime,notes,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',addition.id,addition.debtId,addition.accountId ?? null,addition.existing ? 1 : 0,addition.amount,addition.transactionDate,addition.transactionTime,addition.notes ?? null,addition.createdAt);
    for (const goal of validated.goals ?? []) {
      await transaction.runAsync('INSERT INTO goals(id, name, accountId, targetAmount, targetDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        goal.id, goal.name, goal.accountId, goal.targetAmount, goal.targetDate ?? null, goal.createdAt, goal.updatedAt);
    }
  });
}
/** Start fresh using the existing validated, atomic replacement path. */
export async function resetFinancialData(db: FinanceDatabase): Promise<void> {
  const fresh = parseBackup(serializeBackup([{
    id: 'cash', name: 'Cash', currency: 'PHP', openingBalance: 0,
    purpose: 'spending', includedInAvailable: true, archived: false,
  }], [], new Date().toISOString(), []));
  await restoreBackup(db, fresh, true);
}
