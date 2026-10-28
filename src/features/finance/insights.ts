import { budgetPeriodKey } from './budget-periods';
import { incomeCategory, type Account, type Budget, type Debt, type DebtAddition, type DebtPayment, type SavingsGoal, type Transaction } from './types';
import { calculateCurrentMoney, calculateAccountSummary, calculateFinanceSummary, calculateGoalProgress, calculateSavings } from './calculations';
import { debtTotals } from './debts';
import { budgetReport, OVERALL_BUDGET } from './budgets';
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
function negativeBalance(name: string, amount: number) {
  return name + ' shows ' + money(amount) + '. Check its starting balance and transactions against your actual balance.';
}
function budgetGap(remaining: number, available: number) {
  return 'Your budgets have ' + money(remaining) + " remaining, but your spending accounts have " + money(available) + " available. Budgets don't set money aside.";
}
function exactMoney(value: bigint): string {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Insight total exceeds the supported range.');
  return money(Number(value));
}

/** Prioritized facts from recorded activity, never predictions or financial mutations. */
export function moneyInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], goals: readonly SavingsGoal[], now = new Date(), debtRecords: InsightDebts = noDebts): string[] {
  const date = philippineDateTime(now).transactionDate;
  const month = date.slice(0, 7);
  calculateFinanceSummary(accounts, transactions, month);
  const recorded = transactions.filter(row => row.transactionDate <= date);
  const summary = calculateFinanceSummary(accounts, recorded, month);
  const warnings: string[] = [], progress: string[] = [], observations: string[] = [], budgetDetails: string[] = [];
  for (const account of accounts) {
    const balance = calculateAccountSummary(account, recorded, month).balance;
    if (balance < 0) warnings.push(negativeBalance(account.name, balance));
  }
  const scopes = [budgetPeriodKey('daily', date), budgetPeriodKey('weekly', date), month];
  const limits = scopes.flatMap(scope => budgetReport(budgets, recorded, scope).rows.map(row => ({ row, scope })));
  limits.sort((a,b) => Number(b.row.remaining < 0) - Number(a.row.remaining < 0) || b.row.progress - a.row.progress || a.row.category.localeCompare(b.row.category));
  for (const { row, scope } of limits) {
    const when = scope === month ? 'this month' : scope.startsWith('daily:') ? 'today' : 'this week';
    const subject = row.category === OVERALL_BUDGET ? 'spending limit' : row.category + ' budget';
    if (row.remaining < 0) warnings.push('You spent ' + money(-row.remaining) + ' more than your ' + subject + ' ' + when + '.');
    else if (row.remaining === 0) warnings.push("You've used your " + money(row.limitAmount) + ' ' + subject + ' for ' + when + '.');
    else if (row.progress >= 0.8) warnings.push("You've spent " + money(row.spent) + ' of your ' + money(row.limitAmount) + ' ' + subject + ' ' + when + '. ' + money(row.remaining) + ' remains.');
    else if (row.spent > 0) budgetDetails.push(row.category === OVERALL_BUDGET
      ? "You've spent " + money(row.spent) + ' of your ' + money(row.limitAmount) + ' spending limit ' + when + '.'
      : 'You have ' + money(row.remaining) + ' left for ' + row.category + ' ' + when + '.');
  }
  const monthlyBudget = budgetReport(budgets, recorded, month);
  if (recorded.some(row => row.transactionDate.slice(0, 7) === month)) {
    const available = calculateCurrentMoney(accounts, recorded).availableMoney;
    if (monthlyBudget.positiveRemaining > available && monthlyBudget.positiveRemaining > 0) warnings.push(budgetGap(monthlyBudget.positiveRemaining, available));
  }
  for (const goal of goals) {
    const result = calculateGoalProgress(goal, accounts, recorded);
    if (result.achieved) progress.unshift('Your ' + goal.name + ' goal reached its ' + money(goal.targetAmount) + ' target.');
    else if (result.progress > 0) progress.push('Your ' + goal.name + ' goal has ' + money(result.balance) + ' of its ' + money(goal.targetAmount) + ' target. ' + money(result.remaining) + ' remains.');
  }
  const savings = calculateSavings(accounts, recorded, month);
  if (savings.movedIntoSavings > 0 && savings.movedOutOfSavings > 0) observations.push(money(savings.movedIntoSavings) + ' moved into savings and ' + money(savings.movedOutOfSavings) + ' moved out this month.');
  else if (savings.movedIntoSavings > 0) progress.push(money(savings.movedIntoSavings) + ' moved into savings this month.');
  else if (savings.movedOutOfSavings > 0) observations.push(money(savings.movedOutOfSavings) + ' moved out of savings this month.');

  const previous = month === '1900-01' ? null : adjacentMonth(month, -1);
  if (previous) {
    const previousDays = new Date(Date.UTC(Number(previous.slice(0, 4)), Number(previous.slice(5)), 0)).getUTCDate();
    const elapsed = Math.min(Number(date.slice(8)), previousDays);
    const current = recorded.filter(row => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === month && Number(row.transactionDate.slice(8)) <= elapsed);
    const prior = recorded.filter(row => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === previous && Number(row.transactionDate.slice(8)) <= elapsed);
    if (current.length && prior.length) {
      const difference = calculateFinanceSummary(accounts, current, month).monthlyExpenses - calculateFinanceSummary(accounts, prior, previous).monthlyExpenses;
      if (difference !== 0) {
        const range = (key: string) => readableReportingMonth(key).replace(' ' + key.slice(0, 4), ' 1-' + elapsed + ', ' + key.slice(0, 4));
        const message = 'You spent ' + money(Math.abs(difference)) + (difference > 0 ? ' more' : ' less') + ' during ' + range(month) + ' than during ' + range(previous) + '.';
        (difference > 0 ? observations : progress).push(message);
      }
    }
  }
  const debt = debtsThroughDate(debtRecords, date);
  const outstanding = debtTotals(debt.debts, debt.payments, debt.additions);
  if (outstanding.owed > 0) observations.push('People still owe you ' + money(outstanding.owed) + '. Record repayments when you receive them to update your balance.');
  if (outstanding.owe > 0) observations.push('You have ' + money(outstanding.owe) + ' left to repay.');
  const incomes = new Map<string, number>();
  for (const row of recorded) {
    if (row.type === 'INCOME' && row.transactionDate.slice(0, 7) === month) {
      const category = incomeCategory(row.category);
      incomes.set(category, (incomes.get(category) ?? 0) + row.amount);
    }
  }
  const topIncome = [...incomes].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (topIncome) observations.push(topIncome[0] + ' brought in ' + money(topIncome[1]) + ' this month, ' + ([...incomes.values()].filter(amount => amount === topIncome[1]).length > 1 ? 'tied for your largest income source.' : 'your largest income source.'));
  const spending = spendingByCategory(recorded, month);
  if (spending.length) {
    const top = spending[0], tied = spending.filter(row => row.amount === top.amount).length > 1;
    observations.push(top.category + ' made up ' + money(top.amount) + ' of your ' + money(summary.monthlyExpenses) + ' spending this month.' + (tied ? ' It is tied for your largest spending category.' : ''));
  }
  if (summary.monthlyExpenses > 0 && summary.monthlyIncome === 0) observations.push('You recorded ' + money(summary.monthlyExpenses) + ' in spending this month. This can come from money you already had.');
  const insights = selectInsights([...warnings, ...progress, ...budgetDetails, ...observations]);
  if (!insights.length) insights.push(!recorded.length && accounts.every(account => account.openingBalance === 0)
    ? 'Add your starting balances and transactions to see your money activity.'
    : 'Record your income or expenses to see your money activity.');
  return insights;
}

/** Expressions follow the displayed feedback; ordinary spending is neutral. */
export function moneyInsightReaction(message: string): 'friendly' | 'thinking' | 'celebrating' | 'encouraging' | 'concerned' {
  if (/shows -|more than your .* (?:budget|limit)|Your budgets have .*remaining, but/i.test(message)) return 'concerned';
  if (/goal reached its .* target\.$/i.test(message)) return 'celebrating';
  if (/goal has|moved into savings this month|You spent .* less during/i.test(message)) return 'encouraging';
  if (/You've spent|You've used|moved out|You spent .* more during|insights are unavailable/i.test(message)) return 'thinking';
  return 'friendly';
}

/** Account feedback explains actual movement, keeping definitions behind the help button. */
export function accountInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], now = new Date(), debtRecords: InsightDebts = noDebts) {
  const totals = calculateCurrentMoney(accounts, transactions);
  const date = philippineDateTime(now).transactionDate, month = date.slice(0, 7);
  const balances = accounts.map(account => ({ account, ...calculateAccountSummary(account, transactions, month) }));
  const throughToday = transactions.filter(row => row.transactionDate <= date);
  const monthly = throughToday.filter(row => row.transactionDate.slice(0, 7) === month);
  const warnings: string[] = [], activity: string[] = [], summaries: string[] = [];
  for (const row of balances.filter(row => row.balance < 0).sort((a,b) => a.balance - b.balance)) warnings.push(negativeBalance(row.account.name, row.balance));
  if (totals.availableMoney <= 0 && balances.some(row => row.balance > 0 && !row.account.includedInAvailable)) warnings.push('Your money is in accounts excluded from Available Money. You can review this in Edit account.');
  const remaining = budgetReport(budgets, throughToday, month).positiveRemaining;
  if (remaining > 0 && totals.availableMoney < remaining) warnings.push(budgetGap(remaining, totals.availableMoney));
  const savings = calculateSavings(accounts, transactions, month).balance;
  if (savings > 0) summaries.push(money(savings) + ' is in savings accounts. ' + money(totals.availableMoney) + ' is available for spending.');

  const debt = debtsThroughDate(debtRecords, date);
  const kindByDebt = new Map(debt.debts.map(row => [row.id,row.kind]));
  const borrowingIds = new Map([...kindByDebt, ...debt.additions.map(row => [row.id,kindByDebt.get(row.debtId)] as const)]);
  const repaymentIds = new Map(debt.payments.map(row => [row.id,kindByDebt.get(row.debtId)]));
  let lent = 0n, returned = 0n, borrowed = 0n, repaid = 0n, cashInFees = 0n, cashOutFees = 0n, earnings = 0n;
  const byId = new Map(throughToday.map(row => [row.id,row]));
  const transfers = new Map<string, { source: string; destination: string; amount: bigint; fees: bigint; earnings: bigint }>();
  const adjustments = new Map<string, { change: bigint; count: number }>();
  for (const row of monthly) {
    if (row.type === 'EXTERNAL') {
      if (borrowingIds.get(row.id) === 'owed') lent += BigInt(row.amount);
      if (borrowingIds.get(row.id) === 'owe') borrowed += BigInt(row.amount);
      if (repaymentIds.get(row.id) === 'owed') returned += BigInt(row.amount);
      if (repaymentIds.get(row.id) === 'owe') repaid += BigInt(row.amount);
    }
    const parent = row.exchangeParentId ? byId.get(row.exchangeParentId) : undefined;
    if (row.type === 'EXPENSE' && parent?.exchange?.kind === 'E-bank Cash-in') cashInFees += BigInt(row.amount);
    if (row.type === 'EXPENSE' && parent?.exchange?.kind === 'E-bank Cash-out') cashOutFees += BigInt(row.amount);
    if (row.type === 'INCOME' && parent?.exchange?.kind === 'Service sale') earnings += BigInt(row.amount);
    if (row.type === 'TRANSFER') {
      const key = JSON.stringify([row.accountId,row.destinationAccountId]);
      const group = transfers.get(key) ?? { source:row.accountId, destination:row.destinationAccountId!, amount:0n, fees:0n, earnings:0n };
      group.amount += BigInt(row.amount);
      if (row.exchange) {
        const difference = BigInt(row.exchange.received) - BigInt(row.exchange.paid);
        if (difference < 0n) group.fees -= difference; else group.earnings += difference;
      }
      transfers.set(key,group);
    }
    if (row.type === 'ADJUSTMENT') {
      const group = adjustments.get(row.accountId) ?? { change:0n, count:0 };
      group.change += BigInt(row.amount) * (row.adjustmentDirection === 'increase' ? 1n : -1n); group.count++;
      adjustments.set(row.accountId,group);
    }
  }
  if (lent > 0n || returned > 0n || borrowed > 0n || repaid > 0n) {
    const outstanding = debtTotals(debt.debts,debt.payments,debt.additions);
    if (lent > 0n || returned > 0n) activity.push((lent > 0n ? 'You lent ' + exactMoney(lent) + (returned > 0n ? ' and received ' + exactMoney(returned) + ' back' : '') : 'You received ' + exactMoney(returned) + ' in repayments') + ' this month. ' + (outstanding.owed > 0 ? exactMoney(BigInt(outstanding.owed)) + ' is still owed to you.' : 'Nothing remains owed to you.'));
    if (borrowed > 0n || repaid > 0n) activity.push((borrowed > 0n ? 'You received ' + exactMoney(borrowed) + ' in borrowed money' + (repaid > 0n ? ' and repaid ' + exactMoney(repaid) : '') : 'You repaid ' + exactMoney(repaid)) + ' this month. ' + (outstanding.owe > 0 ? money(outstanding.owe) + ' remains to repay.' : 'Nothing remains to repay.'));
  }
  const fees = cashInFees + cashOutFees;
  if (fees > 0n) activity.push('You paid ' + exactMoney(fees) + ' in ' + (cashInFees > 0n && cashOutFees > 0n ? 'cash-in/out' : cashInFees > 0n ? 'cash-in' : 'cash-out') + ' fees this month. Fees reduce your total money.');
  if (earnings > 0n) activity.push('You recorded ' + exactMoney(earnings) + ' in service-exchange earnings this month.');
  const transfer = [...transfers.values()].sort((a,b) => a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : a.source.localeCompare(b.source) || a.destination.localeCompare(b.destination))[0];
  if (transfer) {
    const source = accounts.find(row => row.id === transfer.source)!, destination = accounts.find(row => row.id === transfer.destination)!;
    let explanation = 'The transferred money stayed within your accounts.';
    if (transfer.fees > 0n || transfer.earnings > 0n) explanation += (transfer.fees > 0n ? ' ' + exactMoney(transfer.fees) + ' in fees reduced your total.' : '') + (transfer.earnings > 0n ? ' ' + exactMoney(transfer.earnings) + ' in earnings increased your total.' : '');
    activity.push(exactMoney(transfer.amount) + ' moved from ' + source.name + ' to ' + destination.name + ' this month. ' + explanation);
  }
  const adjustment = [...adjustments].filter(([,group]) => group.change !== 0n).sort((a,b) => {
    const abs = (value: bigint) => value < 0n ? -value : value;
    return abs(a[1].change) > abs(b[1].change) ? -1 : abs(a[1].change) < abs(b[1].change) ? 1 : a[0].localeCompare(b[0]);
  })[0];
  if (adjustment) {
    const [id,group] = adjustment, name = accounts.find(row => row.id === id)!.name;
    activity.push((group.count === 1 ? 'A balance adjustment ' : 'Balance adjustments ') + (group.change > 0n ? 'increased ' : 'decreased ') + name + ' by ' + exactMoney(group.change < 0n ? -group.change : group.change) + ' this month. This was not ' + (group.change > 0n ? 'income.' : 'spending.'));
  }
  const spenders = accounts.map(account => ({ account, spent:calculateAccountSummary(account, throughToday, month).monthlyExpenses })).filter(row => row.spent > 0).sort((a,b) => b.spent - a.spent || a.account.name.localeCompare(b.account.name));
  if (spenders.length) activity.push('You spent ' + money(spenders[0].spent) + ' from ' + spenders[0].account.name + ' this month.');
  const largest = [...balances].filter(row => row.balance > 0).sort((a,b) => b.balance - a.balance || a.account.name.localeCompare(b.account.name))[0];
  if (largest && balances.filter(row => row.balance > 0).length > 1 && totals.totalMoney > 0 && !totals.hasNegativeAccount) summaries.push(largest.account.name + ' holds ' + money(largest.balance) + ' of your ' + money(totals.totalMoney) + ' total money.');
  const archived = balances.filter(row => row.account.archived && row.balance > 0).sort((a,b) => b.balance - a.balance || a.account.name.localeCompare(b.account.name))[0];
  if (archived) summaries.unshift(archived.account.name + ' is archived but still holds ' + money(archived.balance) + '. That money remains in your total.');
  const insights = selectInsights([...warnings, ...activity, ...summaries]);
  if (!insights.length) insights.push(balances.every(row => row.balance === 0) && !transactions.length
    ? 'Add your starting balances and transactions to see your money activity.'
    : 'You have ' + money(totals.availableMoney) + ' available for spending. No expenses recorded this month yet.');
  return { ...totals, balances, insights };
}
