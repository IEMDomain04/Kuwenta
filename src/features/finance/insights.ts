import { budgetPeriodKey, budgetPeriodLabel } from './budget-periods';
import type { Account, Budget, SavingsGoal, Transaction } from './types';
import { calculateCurrentMoney, calculateAccountSummary, calculateFinanceSummary, calculateGoalProgress, calculateSavings } from './calculations';
import { budgetReport } from './budgets';
import { adjacentMonth, spendingByCategory } from './reporting';
import { formatMoney } from './money';
import { philippineDateTime, readableReportingMonth } from './dates';

const money = (amount: number) => formatMoney(amount, true);

/** Prioritized facts from recorded activity, never predictions or financial mutations. */
export function moneyInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], goals: readonly SavingsGoal[], now = new Date()): string[] {
  const date = philippineDateTime(now).transactionDate;
  const month = date.slice(0, 7);
  const period = readableReportingMonth(month);
  // Validate the complete snapshot, then exclude future entries from period feedback.
  calculateFinanceSummary(accounts, transactions, month);
  const recorded = transactions.filter(row => row.transactionDate <= date);
  const warnings: string[] = [];
  const progress: string[] = [];
  const observations: string[] = [];
  const report = budgetReport(budgets, recorded, month);
  for (const scope of [budgetPeriodKey('daily', date), budgetPeriodKey('weekly', date)]) {
    for (const row of budgetReport(budgets, recorded, scope).rows.filter(row => row.progress >= 0.8)) {
      warnings.push(row.remaining < 0 ? row.category + ' is ' + money(-row.remaining) + ' over budget for ' + budgetPeriodLabel(scope) + '.' : row.category + ': ' + money(Math.max(0, row.remaining)) + ' left for ' + budgetPeriodLabel(scope) + '.');
    }
  }
  for (const account of accounts) {
    const balance = calculateAccountSummary(account, recorded, month).balance;
    if (balance < 0) warnings.push(account.name + ' has a negative recorded balance of ' + money(balance) + '. Review its activity.');
  }
  for (const row of report.rows.filter(row => row.progress >= 0.8).sort((a, b) => b.progress - a.progress || a.category.localeCompare(b.category))) {
    warnings.push(row.remaining < 0
      ? row.category + ' is ' + money(-row.remaining) + ' over budget for ' + period + '.'
      : row.remaining === 0 ? row.category + ' budget limit reached for ' + period + '.'
      : row.category + ': ' + Math.round(row.progress * 100) + '% of the ' + period + ' budget used; ' + money(row.remaining) + ' remaining.');
  }
  const remaining = report.positiveRemaining;
  if (recorded.some(row => row.transactionDate.slice(0, 7) === month)) {
    const available = calculateCurrentMoney(accounts, transactions).availableMoney;
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
    const result = calculateGoalProgress(goal, accounts, transactions);
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
    observations.push(top.category + (tied ? ' is tied for your largest expense category' : ' is your largest expense category') + ' for ' + period + ': ' + money(top.amount) + ' recorded.');
  }
  return [...new Set([...warnings, ...progress, ...observations])];
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
export function accountInsights(accounts: readonly Account[], transactions: readonly Transaction[], budgets: readonly Budget[], now = new Date()) {
  const totals = calculateCurrentMoney(accounts, transactions);
  const date = philippineDateTime(now).transactionDate;
  const month = date.slice(0, 7);
  const balances = accounts.map(account => ({ account, balance: calculateAccountSummary(account, transactions, month).balance }));
  const insights: string[] = [];
  for (const row of balances.filter(row => row.balance < 0).sort((a, b) => a.balance - b.balance)) {
    insights.push(row.account.name + ' has a negative recorded balance of ' + money(row.balance) + '. Review its activity.');
  }
  const throughToday = transactions.filter(row => row.transactionDate <= date);
  const remaining = budgetReport(budgets, throughToday, month).positiveRemaining;
  const savings = balances.filter(row => row.account.purpose === 'savings' && !row.account.includedInAvailable).reduce((total, row) => total + BigInt(row.balance), 0n);
  if (savings > BigInt(Number.MAX_SAFE_INTEGER) || savings < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Savings total exceeds the supported range.');
  if (savings > 0n && (totals.availableMoney <= 0 || totals.availableMoney < remaining || BigInt(totals.availableMoney) * 10n < savings)) {
    insights.push(money(Number(savings)) + ' is in savings, while ' + money(totals.availableMoney) + ' is available for spending. Review upcoming essentials before moving savings.');
  } else if (remaining > totals.availableMoney && remaining > 0) {
    insights.push('Available money is below this month\'s remaining budget limits. You have ' + money(totals.availableMoney) + ' against ' + money(remaining) + ' in allowances.');
  }
  const start = new Date(date + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10);
  const beforePeriod = throughToday.filter(row => row.transactionDate < startDate);
  const drops = balances.filter(row => !row.account.archived).map(row => {
    const prior = calculateAccountSummary(row.account, beforePeriod, month).balance;
    const current = calculateAccountSummary(row.account, throughToday, month).balance;
    return { name: row.account.name, prior, current, decrease: prior - current };
  }).filter(row => row.prior > 0 && row.current >= 0 && row.decrease / row.prior >= 0.25).sort((a, b) => b.decrease - a.decrease || a.name.localeCompare(b.name));
  for (const row of drops) insights.push(row.name + '\'s recorded balance fell by ' + money(row.decrease) + ' over the last 30 days. Spending, transfers, and adjustments can change balances.');
  if (!insights.length) {
    const saved = calculateSavings(accounts, transactions, month).balance;
    const spent = calculateFinanceSummary(accounts, throughToday, month).monthlyExpenses;
    if (saved > 0) {
      insights.push('You have ' + money(saved) + ' in savings and ' + money(totals.availableMoney) + ' available for spending.');
    } else if (spent > 0) {
      insights.push('You have spent ' + money(spent) + ' in ' + readableReportingMonth(month) + ' and have ' + money(totals.availableMoney) + ' available.');
    } else if (balances.every(row => row.balance === 0) && !transactions.length) {
      insights.push('Add your starting balances to see your money overview.');
    } else {
      insights.push('You have ' + money(totals.availableMoney) + ' available for spending. No expenses recorded in ' + readableReportingMonth(month) + ' yet.');
    }
  }
  return { ...totals, balances, insights: [...new Set(insights)] };
}
