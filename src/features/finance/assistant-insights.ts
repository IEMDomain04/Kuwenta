import { categoryScenario, goalScenario, scenarioInputs, type AssistantScenario } from './assistant-scenarios';
import type { AssistantContext, AssistantRecordContext, AssistantTurn } from './assistant-context';
import { calculateAccountSummary, calculateCurrentMoney, calculateFinanceSummary, calculateGoalProgress, calculateSavings } from './calculations';
import { budgetReport } from './budgets';
import { budgetPeriodKey, budgetPeriodLabel, isBudgetPeriodKey } from './budget-periods';
import { adjacentMonth, spendingByCategory } from './reporting';
import { philippineDateTime, readableReportingMonth, isValidMonth } from './dates';
import { formatMoney } from './money';
import { readableAssistantDates } from './assistant-format';

export type InsightSelection = { kind: 'category' | 'comparison' | 'budget' | 'available' | 'savings' | 'income' | 'goal' | 'account' | 'activity'; period: string; category?: string; accountId?: string; goalId?: string };
const kinds = ['category', 'comparison', 'budget', 'available', 'savings', 'income', 'goal', 'account', 'activity'];
const money = (amount: number) => formatMoney(amount, true);
/** Resolve the displayed insight at the entry point; chat receives stable fields, not only prose. */
export function selectAssistantInsight(text: string, data: AssistantRecordContext, now = new Date()): InsightSelection {
  const date = philippineDateTime(now).transactionDate;
  const period = date.slice(0, 7);
  const account = data.accounts.find(row => text.startsWith(row.name + ' has a negative') || text.startsWith(row.name + "'s recorded balance"));
  if (account) return { kind: 'account', accountId: account.id, period };
  const goal = data.goals.find(row => text.startsWith(row.name + ':'));
  if (goal && /target reached|funded;/.test(text)) return { kind: 'goal', goalId: goal.id, period };
  if (/largest expense category/i.test(text)) return { kind: 'category', period, category: spendingByCategory(data.transactions.filter(row => row.transactionDate <= date), period).find(row => text.startsWith(row.category + ' '))?.category };
  if (/largest income source/i.test(text)) return { kind: 'income', period, category: data.transactions.find(row => row.type === 'INCOME' && text.startsWith(row.category + ' brought in'))?.category };
  if (/compared with the same days/i.test(text)) return { kind: 'comparison', period };
  if (/savings/i.test(text)) return { kind: 'savings', period };
  if (/budget|allowances/i.test(text)) {
    const budget = data.budgets.find(row => text.startsWith(row.category + ' ') || text.startsWith(row.category + ':'));
    const scope = budget && [budgetPeriodKey('daily', date), budgetPeriodKey('weekly', date), period].find(key => data.budgets.some(row => row.category === budget.category && row.month === key) && text.includes(budgetPeriodLabel(key)));
    return { kind: budget || /budgeted categories/.test(text) ? 'budget' : 'available', category: budget?.category, period: scope ?? period };
  }
  return { kind: /available|spent/i.test(text) ? 'available' : 'activity', period };
}
export function parseInsightSelection(value: unknown): InsightSelection | undefined {
  if (typeof value !== 'string' || value.length > 1000) return undefined;
  try {
    const item = JSON.parse(value);
    if (!item || !kinds.includes(item.kind) || typeof item.period !== 'string' || !isBudgetPeriodKey(item.period)) return undefined;
    for (const field of ['category', 'accountId', 'goalId']) if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 100)) return undefined;
    const selected: InsightSelection = { kind: item.kind, period: item.period };
    for (const field of ['category', 'accountId', 'goalId'] as const) if (item[field] !== undefined) selected[field] = item[field];
    return selected;
  } catch { return undefined; }
}

/** Exact, relevant support for an insight and its follow-ups. Never changes records. */
export function buildInsightContext(data: AssistantRecordContext, selected: InsightSelection, question: string, now = new Date(), history: readonly AssistantTurn[] = []): AssistantContext {
  const date = philippineDateTime(now).transactionDate;
  const month = isValidMonth(selected.period) ? selected.period : selected.period.slice(-10, -3);
  calculateFinanceSummary(data.accounts, data.transactions, month);
  const records = data.transactions.filter(row => row.transactionDate <= date);
  const report = calculateFinanceSummary(data.accounts, records, month);
  const period = readableReportingMonth(month);
  let hypothetical: AssistantScenario | undefined;
  let summary: string[] = [];
  let requiredAmounts: number[] = [];
  let explanation = 'There is not enough recorded activity for this insight yet. Add any missing records before drawing a conclusion.';
  const facts = ['Selected insight: ' + JSON.stringify(selected), 'Records as of ' + readableAssistantDates(date) + '. Explain this insight, not a general balance report. No future income or unrecorded bills are known.'];
  if (selected.kind === 'category' || selected.kind === 'comparison') {
    const categories = spendingByCategory(records, month);
    const category = categories.find(row => row.category === selected.category) ?? (!selected.category ? categories[0] : undefined);
    if (selected.kind === 'comparison' || /compar|last month|previous month/i.test(question)) {
      if (month !== '1900-01') {
        const priorMonth = adjacentMonth(month, -1);
        const daysIn = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5)), 0)).getUTCDate();
        const elapsed = Math.min(month === date.slice(0, 7) ? Number(date.slice(8)) : daysIn(month), daysIn(priorMonth));
        const matching = (key: string) => records.filter(row => row.type === 'EXPENSE' && row.transactionDate.slice(0, 7) === key && Number(row.transactionDate.slice(8)) <= elapsed && (!selected.category || row.category === selected.category));
        const currentRows = matching(month), priorRows = matching(priorMonth);
        const current = calculateFinanceSummary(data.accounts, currentRows, month).monthlyExpenses;
        const prior = calculateFinanceSummary(data.accounts, priorRows, priorMonth).monthlyExpenses;
        summary = ['Days 1-' + elapsed + ' of ' + period + ': ' + money(current), 'Same days of ' + readableReportingMonth(priorMonth) + ': ' + money(prior)];
        requiredAmounts = [current];
        explanation = priorRows.length && currentRows.length ? '**' + (selected.category ?? 'Recorded spending') + ' is ' + money(Math.abs(current - prior)) + (current > prior ? ' higher' : current < prior ? ' lower' : ' unchanged') + ' across matching dates.**\n\n' + summary.join('. ') + '. These are recorded differences, not predictions; review the purchases to understand the cause.' : '**There are not enough comparable records for a reliable trend.**\n\n' + summary.join('. ') + '. Missing records do not prove spending was zero.';
        if (priorRows.length && currentRows.length) requiredAmounts.push(prior);
      }
    } else if (category && report.monthlyExpenses > 0) {
      const percent = Number((BigInt(category.amount) * 100n + BigInt(report.monthlyExpenses) / 2n) / BigInt(report.monthlyExpenses));
      const other = categories.find(row => row.category !== category.category);
      const rank = categories[0].amount === category.amount ? (other?.amount === category.amount ? 'tied for your largest category' : 'your largest category') : 'one of your expense categories';
      summary = [category.category + ': ' + money(category.amount), period + ' total expenses: ' + money(report.monthlyExpenses), 'Share of recorded expenses: about ' + percent + '%'];
      if (other) summary.push(other.category + ': ' + money(other.amount));
      requiredAmounts = [category.amount, report.monthlyExpenses];
      explanation = '**' + category.category + ' accounts for about ' + percent + '% of your recorded ' + period + ' expenses.**\n\nYou recorded ' + money(category.amount) + ' out of ' + money(report.monthlyExpenses) + ', making it ' + rank + '.' + (other ? ' ' + other.category + ' has ' + money(other.amount) + ' recorded.' : '') + ' If you want to reduce spending, reviewing these purchases is one place to start. A large share alone does not mean you overspent.';
      if (/reduce|cut back|adjust|save/i.test(question)) {
        hypothetical = categoryScenario(category.category, category.amount);
        explanation = category.category + ' has ' + money(category.amount) + ' out of ' + money(report.monthlyExpenses) + ' in recorded expenses for ' + period + '. Review the purchases in this category and choose which you could reduce or skip. A large share alone does not mean you overspent; essentials may still need that money.';
      } else if (/^why|how so/i.test(question.trim())) {
        explanation = 'It stands out because ' + category.category + ' totals ' + money(category.amount) + ' out of ' + money(report.monthlyExpenses) + ' in ' + period + ' expenses, about ' + percent + '%. This reflects the purchases you recorded; it does not explain why you made them or prove you overspent.';
      }
    }
  } else if (selected.kind === 'budget') {
    const row = budgetReport(data.budgets, records, selected.period).rows.find(row => row.category === selected.category);
    if (!selected.category) {
      const budget = budgetReport(data.budgets, records, selected.period);
      if (budget.rows.length) {
        summary = ['Period: ' + budgetPeriodLabel(selected.period), 'Budgeted spending: ' + money(budget.budgetedSpent), 'Combined limit: ' + money(budget.totalLimit)]; requiredAmounts = [budget.budgetedSpent, budget.totalLimit];
        explanation = '**Your budgeted categories have ' + money(budget.budgetedSpent) + ' recorded against ' + money(budget.totalLimit) + ' in limits.**\n\nThis covers ' + budgetPeriodLabel(selected.period) + ' only. ' + (budget.rows.some(item => item.remaining < 0) ? 'Some categories exceed their own limits even if the combined allowance looks sufficient.' : 'Each category is within or at its limit.') + ' Review individual categories before adjusting a limit; allowances do not reserve cash.';
      }
    }
    if (row) {
      summary = [row.category + ' / ' + budgetPeriodLabel(selected.period), 'Spent: ' + money(row.spent), 'Limit: ' + money(row.limitAmount), row.remaining < 0 ? 'Over by: ' + money(-row.remaining) : 'Remaining: ' + money(row.remaining)];
      requiredAmounts = [row.spent, row.limitAmount];
      explanation = '**' + row.category + (row.remaining < 0 ? ' is ' + money(-row.remaining) + ' over its limit.' : ' has ' + money(row.remaining) + ' left.') + '**\n\nYou recorded ' + money(row.spent) + ' against a ' + money(row.limitAmount) + ' limit for ' + budgetPeriodLabel(selected.period) + '. ' + (row.remaining <= 0 ? 'Review the purchases or adjust the limit if your needs changed.' : 'Consider upcoming purchases in this category before using the remaining allowance.') + ' A budget is a plan; it does not reserve cash or change your account balance.';
    }
  } else if (selected.kind === 'income') {
    const amounts = new Map<string, number>();
    for (const row of records.filter(row => row.type === 'INCOME' && row.transactionDate.startsWith(month))) amounts.set(row.category, (amounts.get(row.category) ?? 0) + row.amount);
    const source = selected.category ? [selected.category, amounts.get(selected.category) ?? 0] as const : [...amounts].sort((a, b) => b[1] - a[1])[0];
    if (source) {
      summary = [source[0] + ': ' + money(source[1]), period + ' recorded income: ' + money(report.monthlyIncome)];
      if (report.monthlyIncome > 0) summary.push('Share of income: about ' + Number((BigInt(source[1]) * 100n + BigInt(report.monthlyIncome) / 2n) / BigInt(report.monthlyIncome)) + '%');
      requiredAmounts = [source[1], report.monthlyIncome];
      explanation = '**' + source[0] + ' contributed ' + money(source[1]) + ' in ' + period + '.**\n\nYour recorded income totals ' + money(report.monthlyIncome) + '. This is money already recorded, not a promise that the same amount will arrive again. Consider upcoming needs before setting money aside.';
    }
  } else if (selected.kind === 'savings') {
    const savings = calculateSavings(data.accounts, records, month), totals = calculateCurrentMoney(data.accounts, records);
    summary = ['Savings balance: ' + money(savings.balance), 'Available for spending: ' + money(totals.availableMoney), period + ' moved in: ' + money(savings.movedIntoSavings), 'Moved out: ' + money(savings.movedOutOfSavings)]; requiredAmounts = [savings.balance];
    explanation = '**You have ' + money(savings.balance) + ' recorded in savings accounts.**\n\n' + money(savings.movedIntoSavings) + ' moved into savings and ' + money(savings.movedOutOfSavings) + ' moved out in ' + period + '. Transfers are money moving, not automatically income or expenses. Accounts marked excluded from Available Money stay outside your spending total; fees and actual expenses are reported separately.';
  } else if (selected.kind === 'goal') {
    const goal = data.goals.find(row => row.id === selected.goalId);
    if (goal) {
      const progress = calculateGoalProgress(goal, data.accounts, records);
      const turns = [question, ...history.filter(turn => turn.role === 'user').map(turn => turn.text).reverse()];
      if (/reach|plan|approach|set aside|what if/i.test(turns.join(' '))) hypothetical = goalScenario(progress.remaining, calculateCurrentMoney(data.accounts, records).availableMoney, turns.map(text => scenarioInputs(text).reserve).find(amount => amount !== undefined), /month/i.test(turns.find(text => /month|week/i.test(text)) ?? question));
      summary = [goal.name, 'Current: ' + money(progress.balance), 'Target: ' + money(goal.targetAmount), 'Remaining: ' + money(progress.remaining), 'Goal progress: ' + Math.round(progress.progress * 100) + '%']; requiredAmounts = [progress.balance, goal.targetAmount];
      explanation = '**' + goal.name + (progress.achieved ? ' has reached its target.' : ' needs ' + money(progress.remaining) + ' more.') + '**\n\nIts linked savings account has ' + money(progress.balance) + ' against a ' + money(goal.targetAmount) + ' target. Progress follows that account balance, so moving or spending its money can change progress. Reaching the target does not automatically spend or lock the money.';
    }
  } else if (selected.kind === 'account') {
    const account = data.accounts.find(row => row.id === selected.accountId);
    if (account) {
      const balance = calculateAccountSummary(account, records, month).balance;
      const before = new Date(date + 'T00:00:00Z'); before.setUTCDate(before.getUTCDate() - 29);
      const start = before.toISOString().slice(0, 10);
      const previous = calculateAccountSummary(account, records.filter(row => row.transactionDate < start), month).balance;
      summary = [account.name + ': ' + money(balance), 'Balance before the last 30 days: ' + money(previous)]; requiredAmounts = [balance];
      explanation = '**' + account.name + ' has ' + money(balance) + ' recorded.**\n\nIts balance was ' + money(previous) + ' before the last 30 days. Expenses, transfers and balance adjustments can all change it; a decrease is not necessarily spending. ' + (balance < 0 ? 'Review recorded entries for a missing deposit or incorrect amount.' : 'Review the account activity to see which movements explain the difference.');
    }
  } else {
    const totals = calculateCurrentMoney(data.accounts, records);
    summary = ['Available money: ' + money(totals.availableMoney), 'Total recorded money: ' + money(totals.totalMoney), period + ' recorded expenses: ' + money(report.monthlyExpenses)]; requiredAmounts = [totals.availableMoney];
    const monthlyBudgets = budgetReport(data.budgets, records, month);
    const allowance = monthlyBudgets.rows.reduce((sum, row) => sum + Math.max(0, row.remaining), 0);
    if (monthlyBudgets.rows.length) summary.push('Remaining ' + period + ' allowances: ' + money(allowance));
    explanation = '**You have ' + money(totals.availableMoney) + ' available for spending.**\n\nAvailable Money includes only the accounts you marked included; your total recorded money is ' + money(totals.totalMoney) + '.' + (records.length ? ' You recorded ' + money(report.monthlyExpenses) + ' in expenses for ' + period + '. Upcoming costs and unrecorded purchases may still need money.' : ' There is not enough transaction history to judge a spending trend yet.') + (monthlyBudgets.rows.length ? ' Your remaining ' + period + ' budget allowances total ' + money(allowance) + (totals.availableMoney < allowance ? ', above your available money.' : ', covered by your recorded available balance.') + ' These are spending plans, not reserved cash or confirmed bills.' : '');
  }
  const replyGuide = readableAssistantDates(explanation);
  if (hypothetical) { facts.push('HYPOTHETICAL (not recorded; assumptions only): ' + hypothetical.text); summary.push('What-if only: ' + hypothetical.text); explanation += ' ' + hypothetical.text; }
  const fallback = readableAssistantDates(explanation);
  return { facts: [...facts.map(readableAssistantDates), ...summary, 'REPLY GUIDE: ' + replyGuide, 'Answer the follow-up about this selected insight. Do not replace it with unrelated totals or speculate about why purchases happened.'], summary, fallback, requiredAmounts, hypothetical };
}
