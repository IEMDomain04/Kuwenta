import { isValidMonth } from './dates';
import type { Account, Transaction } from './types';
import { validateAccount, validateManualRecord } from './validation';

function addCentavos(total: number, amount: number): number {
  // Check BEFORE adding; a rounded unsafe intermediate must never become a valid total.
  if ((amount > 0 && total > Number.MAX_SAFE_INTEGER - amount)
    || (amount < 0 && total < Number.MIN_SAFE_INTEGER - amount)) {
    throw new Error('Financial total exceeds the supported range.');
  }
  return total + amount;
}

/** Calculates from records; editing/removing a record simply changes the next result. */
export function calculateAccountSummary(
  account: Account,
  transactions: readonly Transaction[],
  month: string,
): { balance: number; monthlyIncome: number; monthlyExpenses: number; hasNegativeBalance: boolean } {
  validateAccount(account);
  if (!isValidMonth(month)) throw new Error('Reporting month must be YYYY-MM.');
  let balance = account.openingBalance;
  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  const ids = new Set<string>();
  for (const transaction of transactions) {
    if (transaction.accountId !== account.id) continue;
    validateManualRecord(transaction);
    if (ids.has(transaction.id)) throw new Error('Duplicate transaction ID in financial records.');
    ids.add(transaction.id);
    balance = addCentavos(balance, transaction.type === 'INCOME' ? transaction.amount : -transaction.amount);
    if (transaction.transactionDate.slice(0, 7) !== month) continue;
    if (transaction.type === 'INCOME') monthlyIncome = addCentavos(monthlyIncome, transaction.amount);
    else monthlyExpenses = addCentavos(monthlyExpenses, transaction.amount);
  }
  return { balance, monthlyIncome, monthlyExpenses, hasNegativeBalance: balance < 0 };
}
