import { budgetPeriodKey, budgetPeriodLabel } from './budget-periods';
import type { Account, Budget, Debt, DebtAddition, DebtPayment, SavingsGoal, Transaction } from './types';
import { calculateCurrentMoney, calculateAccountSummary, calculateFinanceSummary, calculateGoalProgress, calculateSavings } from './calculations';
import { debtTotals } from './debts';
import { budgetReport } from './budgets';
import { adjacentMonth, spendingByCategory } from './reporting';
import { formatMoney } from './money';
import { philippineDateTime, readableReportingMonth } from './dates';

const money = (amount: number) => formatMoney(amount, true);
type InsightDebts = { debts: readonly Debt[]; payments: readonly DebtPayment[]; additions: readonly DebtAddition[] };
const noDebts: InsightDebts = { debts: [], payments: [], additions: [] };
// One main message plus at most four others in the existing details sheet.
const selectInsights = (messages: readonly string[]) => [...new Set(messages)].slice(0, 5);
function debtsThroughDate(records: InsightDebts, date: string): InsightDebts {
  return {
    debts: records.debts.filter(row => row.transactionDate <= date),
    payments: records.payments.filter(row => row.transactionDate <= date),
    additions: records.additions.filter(row => row.transactionDate <= date),
  };
}

/** Prioritized facts from recorded activity, never predictions or financial mutations. */
export function moneyInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], goals: readonly SavingsGoal[], now = new Date(), debtRecords: InsightDebts = noDebts): string[] {
  const date = philippineDateTime(now).transactionDate;
  const month = date.slice(0, 7);
  const period = readableReportingMonth(month);
  // Validate the complete snapshot, then exclude future entries from period feedback.
  calculateFinanceSummary(accounts, transactions, month);
  const recorded = transactions.filter(row => row.transactionDate <= date);
  const summary = calculateFinanceSummary(accounts, recorded, month);
  const warnings: string[] = [];
  const progress: string[] = [];
  const observations: string[] = [];
  const report = budgetReport(budgets, recorded, month);
  for (const account of accounts) {
    const balance = calculateAccountSummary(account, recorded, month).balance;
    if (balance < 0) warnings.push(account.name + ' has a negative recorded balance of ' + money(balance) + '. Check its starting balance and activity.');
  }
  // Rank exceeded limits before reached/nearby limits, keeping each scope separate.
  const limits = [budgetPeriodKey('daily', date), budgetPeriodKey('weekly', date), month].flatMap(scope =>
    budgetReport(budgets, recorded, scope).rows.filter(row => row.progress >= 0.8).map(row => ({ row, scope })));
  limits.sort((a,b) => Number(b.row.remaining < 0) - Number(a.row.remaining < 0) || b.row.progress - a.row.progress || a.row.category.localeCompare(b.row.category));
  for (const { row, scope } of limits) {
    const label = scope === month ? period : budgetPeriodLabel(scope);
    warnings.push(row.remaining < 0
      ? row.category + ' is ' + money(-row.remaining) + ' over budget for ' + label + '.'
      : row.remaining === 0 ? row.category + ' budget limit reached for ' + label + '.'
      : row.category + ': ' + Math.round(row.progress * 100) + '% of the ' + label + ' budget used; ' + money(row.remaining) + ' remaining.');
  }
  const remaining = report.positiveRemaining;
  if (recorded.some(row => row.transactionDate.slice(0, 7) === month)) {
    const available = calculateCurrentMoney(accounts, recorded).availableMoney;
    if (remaining > 0 && available < remaining) {
      warnings.push(money(available) + ' is available, below the ' + money(remaining) + ' left across this month\'s budgets. Budget limits are not cash.');
    } else if (remaining > 0 && available > remaining) {
      observations.push('Available money exceeds remaining budget limits by ' + money(available - remaining) + '. Unbudgeted spending and upcoming bills may still need money.');
    }
  }
  const savings = calculateSavings(accounts, recorded, month);
  if (savings.savedThisMonth < 0) observations.push(period + ': ' + money(-savings.savedThisMonth) + ' transferred out of savings, net.');
  if (savings.savedThisMonth > 0) progress.push(period + ': ' + money(savings.savedThisMonth) + ' transferred into savings, net.');
  for (const goal of goals) {
    const result = calculateGoalProgress(goal, accounts, recorded);
    if (result.achieved) progress.unshift(goal.name + ': target reached.');
    else if (result.progress > 0) progress.push(goal.name + ': ' + Math.round(result.progress * 100) + '% funded; ' + money(result.remaining) + ' remaining at the current balance.');
  }
  if (report.budgetedSpent > 0 && report.rows.every(row => row.remaining > 0)) {
    progress.push('Your budgeted categories are within their limits for ' + period + '.');
  }
  const previous = month === '1900-01' ? null : adjacentMonth(month, -1);
  const day = Number(date.slice(8));
  // Use equally long periods, including months with fewer days.
  if (previous) {
    const previousDays = new Date(Date.UTC(Number(previous.slice(0, 4)), Number(previous.slice(5)), 0)).getUTCDate();
    const elapsed = Math.min(day, previousDays);
    const current = recorded.filter(row => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === month && Number(row.transactionDate.slice(8)) <= elapsed);
    const prior = recorded.filter(row => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === previous && Number(row.transactionDate.slice(8)) <= elapsed);
    if (current.length && prior.length) {
      const difference = calculateFinanceSummary(accounts, current, month).monthlyExpenses - calculateFinanceSummary(accounts, prior, previous).monthlyExpenses;
      if (difference !== 0) {
        const message = 'Recorded spending for days 1-' + elapsed + ' of ' + period + ' is ' + money(Math.abs(difference)) + (difference > 0 ? ' higher' : ' lower') + ' compared with the same days of ' + readableReportingMonth(previous) + '.';
        (difference > 0 ? observations : progress).push(message);
      }
    }
  }
  const debt = debtsThroughDate(debtRecords, date);
  const outstanding = debtTotals(debt.debts, debt.payments, debt.additions);
  if (outstanding.owed > 0) observations.push(money(outstanding.owed) + ' is still owed to you. This is not included in your account balances.');
  if (outstanding.owe > 0) observations.push('You have ' + money(outstanding.owe) + ' left to repay. Repayments reduce your balance when recorded.');
  const incomes = new Map<string, number>();
  for (const row of recorded) {
    if (row.type === 'INCOME' && row.transactionDate.slice(0, 7) === month) incomes.set(row.category, (incomes.get(row.category) ?? 0) + row.amount);
  }
  const topIncome = [...incomes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (topIncome) {
    const tied = [...incomes.values()].filter(amount => amount === topIncome[1]).length > 1;
    observations.push(topIncome[0] + ' brought in ' + money(topIncome[1]) + ' for ' + period + (tied ? ', tied for your largest income source.' : ', your largest income source.'));
  }
  const spending = spendingByCategory(recorded, month);
  if (spending.length) {
    const top = spending[0];
    const tied = spending.filter(row => row.amount === top.amount).length > 1;
    observations.push(top.category + (tied ? ' is tied for your largest expense category' : ' is your largest expense category') + ' for ' + period + ': ' + money(top.amount) + ' recorded out of ' + money(summary.monthlyExpenses) + ' in expenses.');
  }
  if (summary.monthlyExpenses > 0 && summary.monthlyIncome === 0) observations.push('You have recorded ' + money(summary.monthlyExpenses) + ' in expenses for ' + period + '. Spending can come from starting money too.');
  return selectInsights([...warnings, ...progress, ...observations]);
}

/** Match the displayed feedback: spending alone is not a sign of financial trouble. */
export function moneyInsightReaction(message: string): 'friendly' | 'thinking' | 'celebrating' | 'encouraging' | 'concerned' {
  if (/has a negative recorded balance of|is .* over budget for|is available, below/i.test(message)) return 'concerned';
  if (/: target reached\.$/i.test(message)) return 'celebrating';
  if (/transferred into savings, net|% funded;|budgeted categories are within their limits|lower compared with/i.test(message)) return 'encouraging';
  if (/budget used;|budget limit reached for|transferred out of savings, net|higher compared with|insights are unavailable/i.test(message)) return 'thinking';
  return 'friendly';
}

/** Prioritize noteworthy account activity, with a short summary when there are no warnings. */
export function accountInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], now = new Date(), debtRecords: InsightDebts = noDebts) {
  const totals = calculateCurrentMoney(accounts, transactions);
  const date = philippineDateTime(now).transactionDate;
  const month = date.slice(0, 7);
  const period = readableReportingMonth(month);
  const balances = accounts.map(account => ({ account, ...calculateAccountSummary(account, transactions, month) }));
  const throughToday = transactions.filter(row => row.transactionDate <= date);
  const monthly = throughToday.filter(row => row.transactionDate.slice(0, 7) === month);
  const warnings: string[] = [], activity: string[] = [], summaries: string[] = [];
  for (const row of balances.filter(row => row.balance < 0).sort((a,b) => a.balance - b.balance)) {
    warnings.push(row.account.name + ' has a negative recorded balance of ' + money(row.balance) + '. Check its starting balance and activity.');
  }
  if (totals.availableMoney <= 0 && balances.some(row => row.balance > 0 && !row.account.includedInAvailable)) {
    warnings.push('Your positive balances are in accounts excluded from Available Money. Review this in Edit account.');
  }
  const remaining = budgetReport(budgets, throughToday, month).positiveRemaining;
  if (remaining > 0 && totals.availableMoney < remaining) {
    warnings.push('You have ' + money(totals.availableMoney) + ' available, below the ' + money(remaining) + ' left in this month\'s budgets. Budget limits do not reserve money.');
  }
  const savings = calculateSavings(accounts, transactions, month).balance;
  if (savings > 0) summaries.push('You have ' + money(savings) + ' in savings accounts and ' + money(totals.availableMoney) + ' available for spending.');

  // These IDs identify borrowing/repayments; other external movements are not debts.
  const debt = debtsThroughDate(debtRecords, date);
  const owedIds = new Set(debt.debts.filter(row => row.kind === 'owed').map(row => row.id));
  const lendingIds = new Set([...owedIds, ...debt.additions.filter(row => owedIds.has(row.debtId)).map(row => row.id)]);
  const repaymentIds = new Set(debt.payments.filter(row => owedIds.has(row.debtId)).map(row => row.id));
  let lent = 0n, returned = 0n, fees = 0n;
  const byId = new Map(throughToday.map(row => [row.id,row]));
  const transfers = new Map<string, { source: string; destination: string; amount: bigint }>();
  for (const row of monthly) {
    if (row.type === 'EXTERNAL' && lendingIds.has(row.id)) lent += BigInt(row.amount);
    if (row.type === 'EXTERNAL' && repaymentIds.has(row.id)) returned += BigInt(row.amount);
    const parent = row.exchangeParentId ? byId.get(row.exchangeParentId) : undefined;
    if (row.type === 'EXPENSE' && (parent?.exchange?.kind === 'E-bank Cash-in' || parent?.exchange?.kind === 'E-bank Cash-out')) fees += BigInt(row.amount);
    if (row.type === 'TRANSFER') {
      const key = JSON.stringify([row.accountId,row.destinationAccountId]);
      const group = transfers.get(key) ?? { source:row.accountId, destination:row.destinationAccountId!, amount:0n };
      group.amount += BigInt(row.amount); transfers.set(key,group);
    }
  }
  const asMoney = (value: bigint) => {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Insight total exceeds the supported range.');
    return money(Number(value));
  };
  if (lent > 0n || returned > 0n) {
    const remainingDebt = debtTotals(debt.debts,debt.payments,debt.additions).owed;
    activity.push('You lent ' + asMoney(lent) + ' and received ' + asMoney(returned) + ' back in ' + period + '. ' + money(remainingDebt) + ' remains owed to you.');
  }
  if (fees > 0n) activity.push('Cash-in and cash-out fees totaled ' + asMoney(fees) + ' in ' + period + '. Only the fees count as expenses.');
  const transfer = [...transfers.values()].sort((a,b) => a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : a.source.localeCompare(b.source) || a.destination.localeCompare(b.destination))[0];
  if (transfer) {
    const source = accounts.find(row => row.id === transfer.source)!, destination = accounts.find(row => row.id === transfer.destination)!;
    activity.push(asMoney(transfer.amount) + ' moved from ' + source.name + ' to ' + destination.name + ' in ' + period + '. The transferred amount is not spending.');
  }
  const spenders = accounts.map(account => ({ account, spent:calculateAccountSummary(account, throughToday, month).monthlyExpenses })).filter(row => row.spent > 0).sort((a,b) => b.spent - a.spent || a.account.name.localeCompare(b.account.name));
  if (spenders.length) activity.push('You recorded ' + money(spenders[0].spent) + ' in expenses from ' + spenders[0].account.name + ' in ' + period + '.');
  const largest = [...balances].filter(row => row.balance > 0).sort((a,b) => b.balance - a.balance || a.account.name.localeCompare(b.account.name))[0];
  if (largest && balances.filter(row => row.balance > 0).length > 1 && totals.totalMoney > 0 && !totals.hasNegativeAccount) {
    summaries.push(largest.account.name + ' holds ' + money(largest.balance) + ' of your ' + money(totals.totalMoney) + ' recorded money.');
  }
  const archived = balances.filter(row => row.account.archived && row.balance > 0).sort((a,b) => b.balance - a.balance || a.account.name.localeCompare(b.account.name))[0];
  if (archived) summaries.unshift(archived.account.name + ' is archived but still holds ' + money(archived.balance) + ', included in Total Money.');
  const insights = selectInsights([...warnings, ...activity, ...summaries]);
  if (!insights.length) {
    insights.push(balances.every(row => row.balance === 0) && !transactions.length
      ? 'Add your starting balances to see your money overview.'
      : 'You have ' + money(totals.availableMoney) + ' available for spending. No expenses recorded in ' + period + ' yet.');
  }
  return { ...totals, balances, insights };
}
