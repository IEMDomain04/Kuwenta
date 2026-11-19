import { insightDetailsCollector, type FinancialInsight } from './insight-details';
import { budgetPeriodKey, budgetPeriodLabel } from '../domain/budget-periods';
import { incomeCategory, type Account, type Budget, type Debt, type DebtAddition, type DebtPayment, type SavingsGoal, type Transaction } from '../domain/types';
import { calculateCurrentMoney, calculateAccountSummary, calculateFinanceSummary, calculateGoalProgress, calculateSavings } from '../domain/calculations';
import { debtTotals } from '../domain/debts';
import { budgetReport, OVERALL_BUDGET } from '../domain/budgets';
import { adjacentMonth, spendingByCategory } from './reporting';
import { formatMoney } from '../domain/money';
import { philippineDateTime, readableReportingMonth } from '../domain/dates';

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
export function moneyInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], goals: readonly SavingsGoal[], now = new Date(), debtRecords: InsightDebts = noDebts, details?: FinancialInsight[]): string[] {
  const collector = insightDetailsCollector();
  const detail = collector.describe;
  const date = philippineDateTime(now).transactionDate;
  const month = date.slice(0, 7);
  calculateFinanceSummary(accounts, transactions, month);
  const recorded = transactions.filter(row => row.transactionDate <= date);
  const summary = calculateFinanceSummary(accounts, recorded, month);
  const warnings: string[] = [], progress: string[] = [], observations: string[] = [], budgetDetails: string[] = [];
  for (const account of accounts) {
    const balance = calculateAccountSummary(account, recorded, month).balance;
    if (balance < 0) warnings.push(detail(negativeBalance(account.name, balance), { title: account.name + ' has a negative balance', summary: money(balance) + ' recorded in this account.', icon: 'alert-circle-outline', meaning:'The recorded balance is below zero. Check whether a starting balance or transaction needs correcting.', calculation: 'We add money received to the starting balance, then subtract money paid out. Compare the recorded balance with your actual cash or bank balance.', figures: [{label:'Recorded balance',value:money(balance)}], action:{label:'Review account',pathname:'/account',params:{id:account.id}} }));
  }
  const scopes = [budgetPeriodKey('daily', date), budgetPeriodKey('weekly', date), month];
  const limits = scopes.flatMap(scope => budgetReport(budgets, recorded, scope).rows.map(row => ({ row, scope })));
  limits.sort((a,b) => Number(b.row.remaining < 0) - Number(a.row.remaining < 0) || b.row.progress - a.row.progress || a.row.category.localeCompare(b.row.category));
  for (const { row, scope } of limits) {
    const when = scope === month ? 'this month' : scope.startsWith('daily:') ? 'today' : 'this week';
    const subject = row.category === OVERALL_BUDGET ? 'spending limit' : row.category + ' budget';
    if (row.remaining < 0) warnings.push(detail('You spent ' + money(-row.remaining) + ' more than your ' + subject + ' ' + when + '.', { title: money(-row.remaining) + ' over your ' + subject, summary: 'Your spending is above this limit ' + when + '.', icon:'pie-chart-outline', meaning:'Spending above a budget uses money beyond the limit you set. It does not create a separate charge.', calculation:'We compare recorded spending with this budget limit for the dates shown above. A budget does not set money aside.', figures:[{label:'Period',value:budgetPeriodLabel(scope)},{label:'Limit',value:money(row.limitAmount)},{label:'Spent',value:money(row.spent)}], action:{label:'View budget',pathname:'/budgets',params:{scope}} }));
    else if (row.remaining === 0) warnings.push(detail("You've used your " + money(row.limitAmount) + ' ' + subject + ' for ' + when + '.', { title: 'Your ' + subject + ' is fully used', summary: money(row.limitAmount) + ' spent ' + when + '.', icon:'pie-chart-outline', meaning:'You have used the full budget for this period. Any more spending will go above the limit.', calculation:'Recorded spending for the dates shown above equals this budget limit.', figures:[{label:'Period',value:budgetPeriodLabel(scope)},{label:'Limit',value:money(row.limitAmount)},{label:'Spent',value:money(row.spent)}], action:{label:'View budget',pathname:'/budgets',params:{scope}} }));
    else if (row.progress >= 0.8) warnings.push(detail("You've spent " + money(row.spent) + ' of your ' + money(row.limitAmount) + ' ' + subject + ' ' + when + '. ' + money(row.remaining) + ' remains.', { title: money(row.remaining) + ' left in your ' + subject, summary: 'You are close to this limit ' + when + '.', icon:'pie-chart-outline', meaning:'This is how much is left under your spending limit. Check your available money too, because a budget does not hold cash separately.', calculation:'We subtract spending recorded for this budget from its limit, using the dates shown above.', figures:[{label:'Period',value:budgetPeriodLabel(scope)},{label:'Limit',value:money(row.limitAmount)},{label:'Spent',value:money(row.spent)},{label:'Left',value:money(row.remaining)}], action:{label:'View budget',pathname:'/budgets',params:{scope}} }));
    else if (row.spent > 0) budgetDetails.push(detail(row.category === OVERALL_BUDGET
      ? "You've spent " + money(row.spent) + ' of your ' + money(row.limitAmount) + ' spending limit ' + when + '.'
      : 'You have ' + money(row.remaining) + ' left for ' + row.category + ' ' + when + '.', { title: money(row.remaining) + ' left in your ' + subject, summary: 'Your remaining budget ' + when + '.', icon:'pie-chart-outline', meaning:'This is how much is left under your spending limit. Check your available money too, because a budget does not hold cash separately.', calculation:'We subtract spending recorded for this budget from its limit, using the dates shown above. This is a limit, not a separate balance.', figures:[{label:'Period',value:budgetPeriodLabel(scope)},{label:'Limit',value:money(row.limitAmount)},{label:'Spent',value:money(row.spent)},{label:'Left',value:money(row.remaining)}], action:{label:'View budget',pathname:'/budgets',params:{scope}} }));
  }
  const monthlyBudget = budgetReport(budgets, recorded, month);
  if (recorded.some(row => row.transactionDate.slice(0, 7) === month)) {
    const available = calculateCurrentMoney(accounts, recorded).availableMoney;
    if (monthlyBudget.positiveRemaining > available && monthlyBudget.positiveRemaining > 0) warnings.push(detail(budgetGap(monthlyBudget.positiveRemaining, available), { title:'Your budgets exceed available money', summary:'Your budgets have more left than you currently have available to spend.', icon:'wallet-outline', meaning:'Your budgets are spending limits, not cash set aside. The money you can currently spend is shown as Available Money.', calculation:'We compare the amounts left in monthly budgets with Available Money. Budgets do not set cash aside. An overall budget and category budgets may cover the same spending.', figures:[{label:'Remaining limits',value:money(monthlyBudget.positiveRemaining)},{label:'Available money',value:money(available)}], action:{label:'Review budgets',pathname:'/budgets'} }));
  }
  for (const goal of goals) {
    const result = calculateGoalProgress(goal, accounts, recorded);
    if (result.achieved) progress.unshift(detail('Your ' + goal.name + ' goal reached its ' + money(goal.targetAmount) + ' target.', { title:goal.name + ' goal reached', summary:money(goal.targetAmount) + ' target reached.', icon:'flag-outline', meaning:'You have reached the amount you wanted to save. The money stays in its account until you choose to use it.', calculation:'We compare the savings balance linked to this goal with its target. Reaching the target does not move or spend that money.', figures:[{label:'Target',value:money(goal.targetAmount)},{label:'Saved',value:money(result.balance)}], action:{label:'View goals',pathname:'/goals'} }));
    else if (result.progress > 0) progress.push(detail('Your ' + goal.name + ' goal has ' + money(result.balance) + ' of its ' + money(goal.targetAmount) + ' target. ' + money(result.remaining) + ' remains.', { title:money(result.remaining) + ' more for ' + goal.name, summary:'Your progress toward this savings goal.', icon:'flag-outline', meaning:'This is the amount still needed to reach your goal.', calculation:'We subtract the savings balance linked to this goal from its target.', figures:[{label:'Target',value:money(goal.targetAmount)},{label:'Saved',value:money(result.balance)}], action:{label:'View goals',pathname:'/goals'} }));
  }
  const savings = calculateSavings(accounts, recorded, month);
  if (savings.movedIntoSavings > 0 && savings.movedOutOfSavings > 0) observations.push(detail(money(savings.movedIntoSavings) + ' moved into savings and ' + money(savings.movedOutOfSavings) + ' moved out this month.', { title:money(savings.movedIntoSavings) + ' moved into savings', summary:savings.movedOutOfSavings > 0 ? money(savings.movedOutOfSavings) + ' also moved out this month.' : 'Recorded transfers into savings this month.', icon:'swap-horizontal-outline', meaning:'Moving money into savings changes where you keep it. It does not increase your total money.', calculation:'We add transfers into savings and transfers out of savings separately. Moving your own money is not income or investment growth.', figures:[{label:'Moved in',value:money(savings.movedIntoSavings)},{label:'Moved out',value:money(savings.movedOutOfSavings)},{label:'Savings balance',value:money(savings.balance)}], action:{label:'Review transfers',pathname:'/(tabs)/transactions',month,params:{type:'TRANSFER'}} }));
  else if (savings.movedIntoSavings > 0) progress.push(detail(money(savings.movedIntoSavings) + ' moved into savings this month.', { title:money(savings.movedIntoSavings) + ' moved into savings', summary:savings.movedOutOfSavings > 0 ? money(savings.movedOutOfSavings) + ' also moved out this month.' : 'Recorded transfers into savings this month.', icon:'swap-horizontal-outline', meaning:'Moving money into savings changes where you keep it. It does not increase your total money.', calculation:'We add transfers into savings and transfers out of savings separately. Moving your own money is not income or investment growth.', figures:[{label:'Moved in',value:money(savings.movedIntoSavings)},{label:'Moved out',value:money(savings.movedOutOfSavings)},{label:'Savings balance',value:money(savings.balance)}], action:{label:'Review transfers',pathname:'/(tabs)/transactions',month,params:{type:'TRANSFER'}} }));
  else if (savings.movedOutOfSavings > 0) observations.push(detail(money(savings.movedOutOfSavings) + ' moved out of savings this month.', { title:money(savings.movedOutOfSavings) + ' moved out of savings', summary:'Recorded transfers out of savings this month.', icon:'swap-horizontal-outline', meaning:'Money moved out of savings may still be in another account. A transfer alone does not mean it was spent.', calculation:'We add transfers from savings accounts to spending accounts this month. Moving money between your accounts is not spending.', figures:[{label:'Moved out',value:money(savings.movedOutOfSavings)},{label:'Savings balance',value:money(savings.balance)}], action:{label:'Review transfers',pathname:'/(tabs)/transactions',month,params:{type:'TRANSFER'}} }));

  const previous = month === '1900-01' ? null : adjacentMonth(month, -1);
  if (previous) {
    const previousDays = new Date(Date.UTC(Number(previous.slice(0, 4)), Number(previous.slice(5)), 0)).getUTCDate();
    const elapsed = Math.min(Number(date.slice(8)), previousDays);
    const current = recorded.filter(row => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === month && Number(row.transactionDate.slice(8)) <= elapsed);
    const prior = recorded.filter(row => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === previous && Number(row.transactionDate.slice(8)) <= elapsed);
    if (current.length && prior.length) {
      const currentSpent = calculateFinanceSummary(accounts, current, month).monthlyExpenses;
      const previousSpent = calculateFinanceSummary(accounts, prior, previous).monthlyExpenses;
      const difference = currentSpent - previousSpent;
      if (difference !== 0) {
        const range = (key: string) => readableReportingMonth(key).replace(' ' + key.slice(0, 4), ' 1-' + elapsed + ', ' + key.slice(0, 4));
        const comparison = elapsed === Number(date.slice(8)) ? 'so far this month than by the same date last month.' : 'over the first ' + elapsed + ' days of this month than over the same days last month.';
        const message = 'You spent ' + money(Math.abs(difference)) + (difference > 0 ? ' more ' : ' less ') + comparison
          + '\n' + range(month) + ': ' + money(currentSpent)
          + ' | ' + range(previous) + ': ' + money(previousSpent);
        (difference > 0 ? observations : progress).push(detail(message, { title:money(Math.abs(difference)) + (difference > 0 ? ' more spent' : ' less spent'), summary:'Compared with the same number of days last month.', icon:difference > 0 ? 'trending-up-outline' : 'trending-down-outline', meaning:'This shows how your recorded spending changed between the dates above. Spending more or less does not by itself mean there is a problem.', calculation:'We compare recorded expenses over the same number of days in each month. Transfers and debt repayments are excluded. Fees recorded as expenses are included.', figures:[{label:range(month),value:money(currentSpent)},{label:range(previous),value:money(previousSpent)}], action:{label:'Review expenses',pathname:'/(tabs)/transactions',month,params:{type:'EXPENSE'}} }));
      }
    }
  }
  const debt = debtsThroughDate(debtRecords, date);
  const outstanding = debtTotals(debt.debts, debt.payments, debt.additions);
  if (outstanding.owed > 0) observations.push(detail('People still owe you ' + money(outstanding.owed) + '. Record repayments when you receive them to update your balance.', { title:money(outstanding.owed) + ' owed to you', summary:'Outstanding money you have not received yet.', icon:'people-outline', meaning:'This money is still owed to you. It becomes available only when you receive it and record the payment.', calculation:'We add the money lent, including any extra amounts, then subtract payments received. Money still owed to you is not available cash.', figures:[{label:'Still owed to you',value:money(outstanding.owed)}], action:{label:'View debts',pathname:'/(tabs)/plans',params:{section:'debts'}} }));
  if (outstanding.owe > 0) observations.push(detail('You have ' + money(outstanding.owe) + ' left to repay.', { title:money(outstanding.owe) + ' left to repay', summary:'Your outstanding recorded borrowing.', icon:'people-outline', meaning:'This is the amount you still owe after the payments you have recorded.', calculation:'We add the money borrowed, including any extra amounts, then subtract payments you recorded making.', figures:[{label:'Left to repay',value:money(outstanding.owe)}], action:{label:'View debts',pathname:'/(tabs)/plans',params:{section:'debts'}} }));
  const incomes = new Map<string, number>();
  for (const row of recorded) {
    if (row.type === 'INCOME' && row.transactionDate.slice(0, 7) === month) {
      const category = incomeCategory(row.category);
      incomes.set(category, (incomes.get(category) ?? 0) + row.amount);
    }
  }
  const topIncome = [...incomes].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (topIncome) observations.push(detail(topIncome[0] + ' brought in ' + money(topIncome[1]) + ' this month, ' + ([...incomes.values()].filter(amount => amount === topIncome[1]).length > 1 ? 'tied for your largest income source.' : 'your largest income source.'), { title:topIncome[0] + ': ' + money(topIncome[1]), summary:'Your largest income source this month' + ([...incomes.values()].filter(amount => amount === topIncome[1]).length > 1 ? ' (tied).' : '.'), icon:'cash-outline', meaning:'This source contributed the most recorded income this month. It does not predict what you will receive next month.', calculation:'We add income recorded in each category this month. Transfers and borrowed money are not counted as income.', figures:[{label:topIncome[0],value:money(topIncome[1])}], action:{label:'Review income',pathname:'/(tabs)/transactions',month,params:{type:'INCOME'}} }));
  const spending = spendingByCategory(recorded, month);
  if (spending.length) {
    const top = spending[0], tied = spending.filter(row => row.amount === top.amount).length > 1;
    observations.push(detail(top.category + ' made up ' + money(top.amount) + ' of your ' + money(summary.monthlyExpenses) + ' spending this month.' + (tied ? ' It is tied for your largest spending category.' : ''), { title:top.category + ': ' + money(top.amount), summary:tied ? 'Tied for your largest spending category this month.' : 'Your largest spending category this month.', icon:'bar-chart-outline', meaning:'This category accounts for the most recorded spending this month. You can review its transactions to see what it includes.', calculation:'We add recorded expenses in each category this month. Transfers and debt repayments are not counted as spending.', figures:[{label:top.category,value:money(top.amount)},{label:'All expenses',value:money(summary.monthlyExpenses)}], action:{label:'Review expenses',pathname:'/(tabs)/transactions',month,params:{type:'EXPENSE'}} }));
  }
  if (summary.monthlyExpenses > 0 && summary.monthlyIncome === 0) observations.push(detail('You recorded ' + money(summary.monthlyExpenses) + ' in spending this month. This can come from money you already had.', { title:money(summary.monthlyExpenses) + ' spent from existing money', summary:'No income recorded this month.', icon:'wallet-outline', calculation:'This month has recorded expenses but no income entries. Spending can come from starting balances or money received earlier; missing records can also affect this view.', figures:[{label:'Expenses',value:money(summary.monthlyExpenses)},{label:'Recorded income',value:money(summary.monthlyIncome)}], action:{label:'Review expenses',pathname:'/(tabs)/transactions',month,params:{type:'EXPENSE'}} }));
  const insights = selectInsights([...warnings, ...progress, ...budgetDetails, ...observations]);
  if (!insights.length) insights.push(detail(!recorded.length && accounts.every(account => account.openingBalance === 0)
    ? 'Add your starting balances and transactions to see your money activity.'
    : 'Record your income or expenses to see your money activity.', { title:'Build your money picture', summary:'Add balances and recorded activity to get useful insights.', icon:'bulb-outline', meaning:'Starting balances and transactions help build a clearer picture of your money.', calculation:'Insights use the balances and activity you record. The app does not check your bank or count your cash automatically.', action:{label:'Review accounts',pathname:'/(tabs)/accounts'} }));
  details?.push(...collector.selected(insights));
  return insights;
}

/** Expressions follow the displayed feedback; ordinary spending is neutral. */
export function moneyInsightReaction(message: string): 'friendly' | 'thinking' | 'celebrating' | 'encouraging' | 'concerned' {
  if (/shows -|more than your .* (?:budget|limit)|Your budgets have .*remaining, but/i.test(message)) return 'concerned';
  if (/goal reached its .* target\.$/i.test(message)) return 'celebrating';
  if (/goal has|moved into savings this month|You spent .* less (?:during|so far|over the first)/i.test(message)) return 'encouraging';
  if (/You've spent|You've used|moved out|You spent .* more (?:during|so far|over the first)|insights are unavailable/i.test(message)) return 'thinking';
  return 'friendly';
}

/** Account feedback explains actual movement, keeping definitions behind the help button. */
export function accountInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], now = new Date(), debtRecords: InsightDebts = noDebts) {
  const collector = insightDetailsCollector();
  const detail = collector.describe;
  const totals = calculateCurrentMoney(accounts, transactions);
  const date = philippineDateTime(now).transactionDate, month = date.slice(0, 7);
  const balances = accounts.map(account => ({ account, ...calculateAccountSummary(account, transactions, month) }));
  const throughToday = transactions.filter(row => row.transactionDate <= date);
  const monthly = throughToday.filter(row => row.transactionDate.slice(0, 7) === month);
  const warnings: string[] = [], activity: string[] = [], summaries: string[] = [];
  for (const row of balances.filter(row => row.balance < 0).sort((a,b) => a.balance - b.balance)) warnings.push(detail(negativeBalance(row.account.name, row.balance), { title: row.account.name + ' has a negative balance', summary: money(row.balance) + ' recorded in this account.', icon: 'alert-circle-outline', meaning:'The recorded balance is below zero. Check whether a starting balance or transaction needs correcting.', calculation: 'We add money received to the starting balance, then subtract money paid out. Missing or incorrect records can cause a difference.', figures:[{label:'Recorded balance',value:money(row.balance)}], action:{label:'Review account',pathname:'/account',params:{id:row.account.id}} }));
  if (totals.availableMoney <= 0 && balances.some(row => row.balance > 0 && !row.account.includedInAvailable)) warnings.push(detail('Your money is in accounts excluded from Available Money. You can review this in Edit account.', { title:'Your money is excluded from spending', summary:'Some accounts hold money but are not included in Available Money.', icon:'wallet-outline', meaning:'Available Money includes only the accounts you chose to count for spending. Money in other accounts still belongs to you.', calculation:'We add balances in accounts marked as included in Available Money. You can change this setting when editing an account.', figures:[{label:'Total money',value:money(totals.totalMoney)},{label:'Available money',value:money(totals.availableMoney)}], action:{label:'Review accounts',pathname:'/(tabs)/accounts'} }));
  const remaining = budgetReport(budgets, throughToday, month).positiveRemaining;
  if (remaining > 0 && totals.availableMoney < remaining) warnings.push(detail(budgetGap(remaining, totals.availableMoney), { title:'Your budgets exceed available money', summary:'Your budgets have more left than you currently have available to spend.', icon:'wallet-outline', meaning:'Your budgets are spending limits, not cash set aside. The money you can currently spend is shown as Available Money.', calculation:'We compare the amounts left in monthly budgets with Available Money. Budgets do not set cash aside, and some limits may cover the same spending.', figures:[{label:'Remaining limits',value:money(remaining)},{label:'Available money',value:money(totals.availableMoney)}], action:{label:'Review budgets',pathname:'/budgets'} }));
  const savings = calculateSavings(accounts, transactions, month).balance;
  if (savings > 0) summaries.push(detail(money(savings) + ' is in savings accounts. ' + money(totals.availableMoney) + ' is available for spending.', { title:money(savings) + ' in savings accounts', summary:money(totals.availableMoney) + ' available for spending.', icon:'wallet-outline', meaning:'Savings shows where you keep money. Some savings accounts may also be included in Available Money, depending on your settings.', calculation:'Savings adds balances in accounts marked Savings. Available Money adds balances in accounts marked as included. An account can belong to both groups, so these amounts should not be added together.', figures:[{label:'Savings balance',value:money(savings)},{label:'Available money',value:money(totals.availableMoney)}], action:{label:'Review accounts',pathname:'/(tabs)/accounts'} }));

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
    if (lent > 0n || returned > 0n) activity.push(detail((lent > 0n ? 'You lent ' + exactMoney(lent) + (returned > 0n ? ' and received ' + exactMoney(returned) + ' back' : '') : 'You received ' + exactMoney(returned) + ' in repayments') + ' this month. ' + (outstanding.owed > 0 ? exactMoney(BigInt(outstanding.owed)) + ' is still owed to you.' : 'Nothing remains owed to you.'), { title:exactMoney(BigInt(outstanding.owed)) + ' still owed to you', summary:'Money lent and paid back this month.', icon:'people-outline', meaning:'Money still owed to you is not available cash. Record payments when you actually receive them.', calculation:'We add all money lent and any extra amounts, then subtract payments received through today. The monthly figures show only this month, while the amount still owed includes earlier records.', figures:[{label:'Lent this month',value:exactMoney(lent)},{label:'Received back this month',value:exactMoney(returned)},{label:'Still owed to you',value:money(outstanding.owed)}], action:{label:'View debts',pathname:'/(tabs)/plans',params:{section:'debts'}} }));
    if (borrowed > 0n || repaid > 0n) activity.push(detail((borrowed > 0n ? 'You received ' + exactMoney(borrowed) + ' in borrowed money' + (repaid > 0n ? ' and repaid ' + exactMoney(repaid) : '') : 'You repaid ' + exactMoney(repaid)) + ' this month. ' + (outstanding.owe > 0 ? money(outstanding.owe) + ' remains to repay.' : 'Nothing remains to repay.'), { title:money(outstanding.owe) + ' left to repay', summary:'Money borrowed and paid back this month.', icon:'people-outline', meaning:'The amount left to repay includes earlier borrowing, not just money borrowed this month.', calculation:'We add all money borrowed and any extra amounts, then subtract payments made through today. The monthly figures show only this month, while the amount still owed includes earlier records.', figures:[{label:'Borrowed this month',value:exactMoney(borrowed)},{label:'Repaid this month',value:exactMoney(repaid)},{label:'Left to repay',value:money(outstanding.owe)}], action:{label:'View debts',pathname:'/(tabs)/plans',params:{section:'debts'}} }));
  }
  const fees = cashInFees + cashOutFees;
  if (fees > 0n) activity.push(detail('You paid ' + exactMoney(fees) + ' in ' + (cashInFees > 0n && cashOutFees > 0n ? 'cash-in/out' : cashInFees > 0n ? 'cash-in' : 'cash-out') + ' fees this month. Fees reduce your total money.', { title:exactMoney(fees) + ' in cash-in/out fees', summary:'Recorded fees this month.', icon:'receipt-outline', meaning:'These fees reduced your total money. The money exchanged between your accounts is separate from the fee.', calculation:'We add fees recorded for cash-in and cash-out exchanges this month. The fees count as spending; money moved between your accounts does not.', figures:[{label:'Cash-in fees',value:exactMoney(cashInFees)},{label:'Cash-out fees',value:exactMoney(cashOutFees)}], action:{label:'Review fees',pathname:'/(tabs)/transactions',month,params:{type:'EXPENSE'}} }));
  if (earnings > 0n) activity.push(detail('You recorded ' + exactMoney(earnings) + ' in service-exchange earnings this month.', { title:exactMoney(earnings) + ' in exchange earnings', summary:'Recorded service-exchange earnings this month.', icon:'cash-outline', meaning:'These are the recorded earnings from exchanges, not the full amount you received.', calculation:'We add earnings recorded for service exchanges this month. The full amount received from the other person is not counted as earnings.', figures:[{label:'Earnings',value:exactMoney(earnings)}], action:{label:'Review earnings',pathname:'/(tabs)/transactions',month,params:{type:'INCOME'}} }));
  const transfer = [...transfers.values()].sort((a,b) => a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : a.source.localeCompare(b.source) || a.destination.localeCompare(b.destination))[0];
  if (transfer) {
    const source = accounts.find(row => row.id === transfer.source)!, destination = accounts.find(row => row.id === transfer.destination)!;
    let explanation = 'The transferred money stayed within your accounts.';
    if (transfer.fees > 0n || transfer.earnings > 0n) explanation += (transfer.fees > 0n ? ' ' + exactMoney(transfer.fees) + ' in fees reduced your total.' : '') + (transfer.earnings > 0n ? ' ' + exactMoney(transfer.earnings) + ' in earnings increased your total.' : '');
    activity.push(detail(exactMoney(transfer.amount) + ' moved from ' + source.name + ' to ' + destination.name + ' this month. ' + explanation, { title:exactMoney(transfer.amount) + ' moved between accounts', summary:source.name + ' to ' + destination.name + ' this month.', icon:'swap-horizontal-outline', meaning:explanation, calculation:'We add transfers between these two accounts this month. Fees and earnings are shown separately from the transferred amount.', figures:[{label:'Transferred',value:exactMoney(transfer.amount)},{label:'Fees',value:exactMoney(transfer.fees)},{label:'Earnings',value:exactMoney(transfer.earnings)}], action:{label:'Review transfers',pathname:'/(tabs)/transactions',month,params:{type:'TRANSFER',accountId:source.id}} }));
  }
  const adjustment = [...adjustments].filter(([,group]) => group.change !== 0n).sort((a,b) => {
    const abs = (value: bigint) => value < 0n ? -value : value;
    return abs(a[1].change) > abs(b[1].change) ? -1 : abs(a[1].change) < abs(b[1].change) ? 1 : a[0].localeCompare(b[0]);
  })[0];
  if (adjustment) {
    const [id,group] = adjustment, name = accounts.find(row => row.id === id)!.name;
    activity.push(detail((group.count === 1 ? 'A balance adjustment ' : 'Balance adjustments ') + (group.change > 0n ? 'increased ' : 'decreased ') + name + ' by ' + exactMoney(group.change < 0n ? -group.change : group.change) + ' this month. This was not ' + (group.change > 0n ? 'income.' : 'spending.'), { title:name + ' balance corrected', summary:exactMoney(group.change < 0n ? -group.change : group.change) + (group.change > 0n ? ' added by corrections this month.' : ' removed by corrections this month.'), icon:'create-outline', meaning:'A correction changes your recorded balance to match the amount you entered. It is not income or spending.', calculation:'We add balance increases and subtract balance decreases recorded as corrections this month. Corrections are not counted as income or spending.', figures:[{label:'Net correction',value:exactMoney(group.change)}], action:{label:'Review account',pathname:'/account',params:{id}} }));
  }
  const spenders = accounts.map(account => ({ account, spent:calculateAccountSummary(account, throughToday, month).monthlyExpenses })).filter(row => row.spent > 0).sort((a,b) => b.spent - a.spent || a.account.name.localeCompare(b.account.name));
  if (spenders.length) activity.push(detail('You spent ' + money(spenders[0].spent) + ' from ' + spenders[0].account.name + ' this month.', { title:money(spenders[0].spent) + ' spent from ' + spenders[0].account.name, summary:'The account with the most recorded spending this month.', icon:'bar-chart-outline', meaning:'More spending was recorded from this account than any other this month. Moving money between accounts is not included.', calculation:'We add recorded expenses for each account this month. Transfers do not count as spending.', figures:[{label:spenders[0].account.name,value:money(spenders[0].spent)}], action:{label:'Review expenses',pathname:'/(tabs)/transactions',month,params:{type:'EXPENSE',accountId:spenders[0].account.id}} }));
  const largest = [...balances].filter(row => row.balance > 0).sort((a,b) => b.balance - a.balance || a.account.name.localeCompare(b.account.name))[0];
  if (largest && balances.filter(row => row.balance > 0).length > 1 && totals.totalMoney > 0 && !totals.hasNegativeAccount) summaries.push(detail(largest.account.name + ' holds ' + money(largest.balance) + ' of your ' + money(totals.totalMoney) + ' total money.', { title:largest.account.name + ' holds ' + money(largest.balance), summary:'The largest balance among your accounts.', icon:'wallet-outline', meaning:'This account holds the largest part of your recorded money. Its balance is included in Total Money.', calculation:'We calculate each balance from starting money and recorded activity. Total Money includes savings and archived accounts.', figures:[{label:largest.account.name,value:money(largest.balance)},{label:'Total money',value:money(totals.totalMoney)}], action:{label:'Review account',pathname:'/account',params:{id:largest.account.id}} }));
  const archived = balances.filter(row => row.account.archived && row.balance > 0).sort((a,b) => b.balance - a.balance || a.account.name.localeCompare(b.account.name))[0];
  if (archived) summaries.unshift(detail(archived.account.name + ' is archived but still holds ' + money(archived.balance) + '. That money remains in your total.', { title:money(archived.balance) + ' in an archived account', summary:archived.account.name + ' still holds recorded money.', icon:'archive-outline', meaning:'Archiving an account does not remove its money from your totals.', calculation:'Archived accounts are hidden from normal use, but their balances still count in Total Money.', figures:[{label:archived.account.name,value:money(archived.balance)}], action:{label:'Review accounts',pathname:'/(tabs)/accounts'} }));
  const insights = selectInsights([...warnings, ...activity, ...summaries]);
  if (!insights.length) insights.push(detail(balances.every(row => row.balance === 0) && !transactions.length
    ? 'Add your starting balances and transactions to see your money activity.'
    : 'You have ' + money(totals.availableMoney) + ' available for spending. No expenses recorded this month yet.', { title:'Your recorded money', summary:money(totals.availableMoney) + ' available for spending.', icon:'wallet-outline', meaning:'Available Money includes only the accounts you chose to count for spending. Money in other accounts still belongs to you.', calculation:'We add balances in accounts marked as included in Available Money. Starting balances and recorded activity determine each balance.', figures:[{label:'Available money',value:money(totals.availableMoney)}], action:{label:'Review accounts',pathname:'/(tabs)/accounts'} }));
  return { ...totals, balances, insights, insightDetails: collector.selected(insights) };
}
