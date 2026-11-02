import { isValidMonth } from './dates';
import type { Account, Transaction, SavingsGoal } from './types';
import { validateAccount, validateManualRecord, validateGoal } from './validation';

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
    if (transaction.accountId !== account.id && !(transaction.type === 'TRANSFER' && transaction.destinationAccountId === account.id)) continue;
    validateManualRecord(transaction);
    if (ids.has(transaction.id)) throw new Error('Duplicate transaction ID in financial records.');
    ids.add(transaction.id);
    balance = addCentavos(balance, (transaction.type === 'TRANSFER' && transaction.destinationAccountId === account.id || transaction.type === 'INCOME' || ((transaction.type === 'ADJUSTMENT' || transaction.type === 'EXTERNAL') && transaction.adjustmentDirection === 'increase')) ? transaction.amount : -transaction.amount);
    if (transaction.transactionDate.slice(0, 7) !== month) continue;
    if (transaction.type === 'INCOME') monthlyIncome = addCentavos(monthlyIncome, transaction.amount);
    else if (transaction.type === 'EXPENSE') monthlyExpenses = addCentavos(monthlyExpenses, transaction.amount);
  }
  return { balance, monthlyIncome, monthlyExpenses, hasNegativeBalance: balance < 0 };
}

/** Cash remains the Home balance; monthly reports include all accounts, including archived history. */
export function calculateFinanceSummary(accounts: readonly Account[], transactions: readonly Transaction[], month: string) {
  const accountIds = new Set<string>();
  for (const account of accounts) {
    validateAccount(account);
    if (accountIds.has(account.id)) throw new Error('Duplicate account ID.');
    accountIds.add(account.id);
  }
  const cash = accounts.find((account) => account.id === 'cash');
  if (!cash) throw new Error('Cash account is missing.');
  const ids = new Set<string>();
  for (const row of transactions) {
    validateManualRecord(row);
    if (!accountIds.has(row.accountId) || row.type === 'TRANSFER' && !accountIds.has(row.destinationAccountId!)) throw new Error('Transaction references an unknown account.');
    if (ids.has(row.id)) throw new Error('Duplicate transaction ID in financial records.');
    ids.add(row.id);
  }
  const summary = calculateAccountSummary(cash, transactions, month);
  summary.monthlyIncome = 0;
  summary.monthlyExpenses = 0;
  for (const account of accounts) {
    const result = calculateAccountSummary(account, transactions, month);
    summary.monthlyIncome = addCentavos(summary.monthlyIncome, result.monthlyIncome);
    summary.monthlyExpenses = addCentavos(summary.monthlyExpenses, result.monthlyExpenses);
  }
  return summary;
}
/** Current balances across every month. Archiving never removes money from these totals. */
export function calculateCurrentMoney(accounts: readonly Account[], transactions: readonly Transaction[]) {
  calculateFinanceSummary(accounts, transactions, '1900-01');
  let totalMoney = 0;
  let availableMoney = 0;
  let hasNegativeAccount = false;
  for (const account of accounts) {
    const { balance } = calculateAccountSummary(account, transactions, '1900-01');
    totalMoney = addCentavos(totalMoney, balance);
    if (account.includedInAvailable) availableMoney = addCentavos(availableMoney, balance);
    if (balance < 0) hasNegativeAccount = true;
  }
  return { totalMoney, availableMoney, hasNegativeAccount };
}
/** Current savings balances and selected-month net funding, independent of income/expense totals. */
export function calculateSavings(accounts: readonly Account[], transactions: readonly Transaction[], month: string) {
  const reports = calculateFinanceSummary(accounts, transactions, month);
  let balance = 0;
  let savedThisMonth = 0;
  let movedIntoSavings = 0;
  let movedOutOfSavings = 0;
  let usesLegacyPurposes = false;
  for (const account of accounts.filter((row) => row.purpose === 'savings')) {
    balance = addCentavos(balance, calculateAccountSummary(account, transactions, month).balance);
  }
  for (const row of transactions) {
    if (row.type !== 'TRANSFER' || row.transactionDate.slice(0, 7) !== month) continue;
    const source = row.sourcePurpose ?? accounts.find((account) => account.id === row.accountId)!.purpose;
    const destination = row.destinationPurpose ?? accounts.find((account) => account.id === row.destinationAccountId)!.purpose;
    if (row.sourcePurpose === undefined) usesLegacyPurposes = true;
    if (source === 'spending' && destination === 'savings') { movedIntoSavings = addCentavos(movedIntoSavings, row.amount); savedThisMonth = addCentavos(savedThisMonth, row.amount); }
    if (source === 'savings' && destination === 'spending') { movedOutOfSavings = addCentavos(movedOutOfSavings, row.amount); savedThisMonth = addCentavos(savedThisMonth, -row.amount); }
  }
  return { balance, movedIntoSavings, movedOutOfSavings, savedThisMonth, savingsRate: reports.monthlyIncome === 0 ? null : savedThisMonth / reports.monthlyIncome * 100, usesLegacyPurposes };
}
export function calculateGoalProgress(goal: SavingsGoal, accounts: readonly Account[], transactions: readonly Transaction[]) {
  validateGoal(goal, accounts);
  const balance = calculateAccountSummary(accounts.find((row) => row.id === goal.accountId)!, transactions, '1900-01').balance;
  const remaining = BigInt(goal.targetAmount) - BigInt(balance);
  if (remaining > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Goal remaining amount exceeds the supported range.');
  return { balance, remaining: Math.max(0, Number(remaining)), progress: Math.max(0, Math.min(1, balance / goal.targetAmount)), achieved: balance >= goal.targetAmount };
}
