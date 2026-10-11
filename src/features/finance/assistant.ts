import type { Account, Budget, SavingsGoal, Transaction } from './types';
import { CATEGORIES } from './types';
import { calculateAccountSummary, calculateCurrentMoney, calculateFinanceSummary, calculateGoalProgress, calculateSavings } from './calculations';
import { budgetReport } from './budgets';
import { philippineDateTime, readableReportingMonth } from './dates';
import { formatMoney, parseMoney } from './money';
import { spendingByCategory } from './reporting';

export const ASSISTANT_INTENTS = ['purchase', 'recurring', 'spending', 'budget', 'savings', 'balance', 'saving_plan', 'unknown'] as const;
export type AssistantIntent = typeof ASSISTANT_INTENTS[number];
export type AssistantRequest = { intent: AssistantIntent; amount?: number; frequency?: 'daily' | 'weekdays'; days?: number; months?: number; category?: string; accountName?: string; text: string; replacement?: boolean; existingMeal?: number };
type Context = { accounts: readonly Account[]; transactions: readonly Transaction[]; budgets: readonly Budget[]; goals: readonly SavingsGoal[] };
function safe(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('That scenario exceeds the supported amount range.');
  return Number(value);
}
/** Recognizes supported money-check phrases; amounts and durations are exact. */
export function parseAssistantRequest(text: string, previous?: AssistantRequest): AssistantRequest {
  if (!text.trim() || text.length > 250) throw new Error('Use one short question.');
  if (/\b(usd|dollars?|eur|euros?|loan|utang|invest|stocks?|crypto)\b|\$/i.test(text)) throw new Error('I can compare recorded peso spending, budgets, and savings. This question needs a different kind of assessment.');
  if (/\b(weekly|every week|twice|three times|every other|starting|tomorrow|bukas)\b/i.test(text)) throw new Error('I can check one purchase, daily or weekday expenses starting today, or monthly savings. Please clarify the frequency and timeframe.');
  const lower = text.toLowerCase();
  let intent: AssistantIntent = 'unknown';
  if (/\b(balance|available|total money|natitirang pera)\b/.test(lower) || /pera ko/i.test(lower) && !/maubos|gastos|napupunta/i.test(lower)) intent = 'balance';
  else if (/\b(save|saving|ipon|mag-ipon)\b.*\b(every month|monthly|bawat buwan|buwan)/.test(lower)) intent = 'saving_plan';
  else if (/\b(every day|everyday|daily|araw-araw|araw araw|every weekday|weekdays)\b/.test(lower)) intent = 'recurring';
  else if (/\b(can i|could i|should i|what if|afford|kaya ko|dapat ba|pwede ba)\b.*\b(buy|spend|eat|purchase|bumili|bilhin|kumain|gastos)\b/.test(lower) || /\b(can i afford|kaya ko bang bumili)\b/.test(lower)) intent = 'purchase';
  else if (/\b(savings?|goals?|laptop|ipon|target)\b/.test(lower)) intent = 'savings';
  else if (/\b(budget|badyet)\b/.test(lower)) intent = 'budget';
  else if (/\b(spend|spent|spending|expenses?|food|income|gastos|maubos|pagkain|pera.*napupunta|money going)\b/.test(lower)) intent = 'spending';
  const continuation = previous && (/^(?:every day|daily|weekdays|every weekday|this month|araw-araw)[?.!]*$/i.test(text.trim()) || /^(?:php\s*|\u20b1)?\d[\d,.]*(?:\s*pesos?)?[.!]?$/i.test(text.trim()) || /^(?:for |over |next )?\d+\s+(days?|weeks?|months?)\??$/i.test(text.trim()) || /^(replace|replacing|replacement|additional|extra|add|dagdag|kapalit)\b/i.test(text));
  if (continuation) intent = previous.intent;
  const request: AssistantRequest = continuation ? { ...previous, text: (previous.text + ' ' + text).slice(-500) } : { intent, text };
  const duration = text.match(/\b(?:for|over|next)?\s*(\d+)\s*(days?|weeks?|months?)\b/i);
  let body = duration ? text.replace(duration[0], '') : text;
  const accountClause = body.match(/\b(?:from|using)\s+(.+?)[?.!]*$/i);
  if (accountClause) { request.accountName = accountClause[1].trim().replace(/[?.!]+$/, ''); body = body.slice(0, accountClause.index); }
  if (duration) {
    const count = Number(duration[1]);
    if (!Number.isInteger(count) || count < 1 || count > 366) throw new Error('Choose a duration between one and 366 days, or up to 12 months.');
    if (/month/i.test(duration[2])) { if (count > 12) throw new Error('Use up to 12 months.'); request.months = count; request.days = undefined; }
    else { request.days = count * (/week/i.test(duration[2]) ? 7 : 1); request.months = undefined; if (request.days > 366) throw new Error('Use up to 366 days.'); }
  }
  if (/\b(save|saving|ipon)\b.*\b(instead|rather)/i.test(text)) { request.intent = 'savings'; }
  if (/this month/i.test(text)) { request.months = 0; request.days = undefined; }
  if (/weekdays|every weekday/i.test(text)) request.frequency = 'weekdays';
  else if (/every day|everyday|daily|araw[- ]araw/i.test(text)) request.frequency = 'daily';
  const categories: [string, RegExp][] = [['Food', /\b(food|meal|mami|rice|coffee|eat|pagkain|kumain)\b/i], ['Transportation', /\b(fare|transport|pamasahe|commute)\b/i], ['Shopping', /\b(shoes|sapatos|shopping)\b/i], ['Entertainment', /\b(controller|game|headset)\b/i]];
  const matches = CATEGORIES.EXPENSE.filter((category) => new RegExp('\\b' + category + '\\b', 'i').test(text));
  const semantic = categories.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
  const categoryMatches = [...new Set([...matches, ...semantic])];
  if (categoryMatches.length === 1) request.category = categoryMatches[0];
  if (categoryMatches.length > 1 && /purchase|recurring/.test(intent)) throw new Error('Which spending category should this purchase use?');
  const amounts = [...body.matchAll(/[-+]?\d[\d,]*(?:\.\d+)?[a-z]*/gi)];
  if (amounts.length > 1) throw new Error('Please give one purchase price or contribution amount at a time.');
  if (amounts.length) {
    const raw = amounts[0][0];
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) throw new Error('Use a positive peso amount such as 60 or 1,200.50.');
    const amount = parseMoney(raw.replace(/,/g, ''));
    if (/^replac/i.test(text) && previous?.replacement) request.existingMeal = amount;
    else request.amount = amount;
  }
  if (/^(replace|replacing|replacement|kapalit)\b/i.test(text)) { request.replacement = true; if (amounts.length) { request.existingMeal = parseMoney(amounts[0][0].replace(/,/g, '')); request.amount = previous?.amount; } }
  if (/^(additional|extra|add|dagdag)\b/i.test(text)) request.replacement = false;
  return request;
}
export function recurringOccurrences(request: AssistantRequest, date: string): { count: number; days: number; end: string } {
  const start = new Date(date + 'T00:00:00Z');
  let days = request.days;
  if (request.months !== undefined) {
    const end = request.months === 0 ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + request.months, Math.min(start.getUTCDate(), new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + request.months + 1, 0)).getUTCDate())));
    days = Math.round((end.getTime() - start.getTime()) / 86400000);
  }
  if (!days || days < 1 || days > 366 || !Number.isInteger(days)) throw new Error('Choose a timeframe for this recurring expense.');
  let count = 0;
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(start.getTime() + offset * 86400000).getUTCDay();
    if (request.frequency === 'daily' || day !== 0 && day !== 6) count++;
  }
  return { count, days, end: new Date(start.getTime() + (days - 1) * 86400000).toISOString().slice(0, 10) };
}
/** Read-only snapshot access; never invokes a provider mutation or accepts SQL. */
export function answerAssistant(request: AssistantRequest, context: Context, now = new Date()): { text: string; pending?: AssistantRequest } {
  const date = philippineDateTime(now).transactionDate;
  const month = date.slice(0, 7);
  const money = calculateCurrentMoney(context.accounts, context.transactions);
  const chosen = request.accountName ? context.accounts.filter((account) => !account.archived && account.name.toLowerCase() === request.accountName!.toLowerCase()) : [];
  if (request.accountName && chosen.length !== 1) return { text: 'I could not identify one active account named ' + request.accountName + '. Please restate the question using its exact name.' };
  const funds = chosen.length ? calculateAccountSummary(chosen[0], context.transactions, month).balance : money.availableMoney;
  const fundLabel = chosen.length ? 'balance in ' + chosen[0].name : 'available money';
  const report = budgetReport(context.budgets, context.transactions, month);
  const budget = report.rows.find((row) => row.category === request.category);
  const clarification = (text: string) => ({ text, pending: request });
  let text: string;
  if (/\b(delete|remove|transfer|restore|reset|record|add transaction)\b/i.test(request.text)) return { text: 'This assistant only reads records and checks scenarios. Use the account or transaction screens to make changes.' };
  if (request.intent === 'unknown') return { text: 'I can compare a purchase, recurring spending, budgets, or savings. What would you like to check?' };
  if (request.intent === 'purchase' || request.intent === 'recurring') {
    if (request.amount === undefined) return clarification('You have ' + formatMoney(funds) + ' in recorded ' + fundLabel + '. How much does it cost?');
    let cost = request.amount;
    let period = '';
    if (request.intent === 'recurring') {
      if (!request.frequency) return clarification('Would that spending happen every day or on weekdays?');
      if (request.days === undefined && request.months === undefined) return clarification('At ' + formatMoney(cost) + ' per purchase, what timeframe should I check? For example, 7 days, 30 days, or this month.');
      const occurrences = recurringOccurrences(request, date);
      cost = safe(BigInt(cost) * BigInt(occurrences.count));
      period = ' across ' + occurrences.count + ' purchases from ' + date + ' through ' + occurrences.end;
      if (request.replacement) {
        if (request.existingMeal === undefined) return clarification('How much does the usual purchase cost? Reply Replacement 50, for example, so I can compare the difference.');
        cost = safe(BigInt(request.amount - request.existingMeal) * BigInt(occurrences.count));
        period += ' compared with the purchases it replaces';
      }
    }
    const remaining = safe(BigInt(funds) - BigInt(cost));
    text = (request.replacement ? 'The change in spending would be ' : 'The planned cost is ') + formatMoney(cost) + period + '. ' + (remaining < 0 ? 'It exceeds your recorded ' + fundLabel + ' by ' + formatMoney(-remaining) + '.' : 'Your recorded ' + fundLabel + ' would be ' + formatMoney(remaining) + ' afterward.');
    if (budget && request.intent === 'purchase') text += ' Your ' + budget.category + ' budget has ' + formatMoney(budget.remaining) + ' remaining; this purchase would leave ' + formatMoney(safe(BigInt(budget.remaining) - BigInt(cost))) + '.';
    if (budget && request.intent === 'recurring') text += ' Your current ' + budget.category + ' budget has ' + formatMoney(budget.remaining) + ' remaining. This scenario may span other months, whose budgets are separate.';
    text += ' This is hypothetical; upcoming bills and income are not included. Your records stay unchanged.';
    if (chosen[0]?.purpose === 'savings') text += ' Paying from this savings account would reduce funds held for its linked goals.';
    if (request.intent === 'recurring' && request.replacement === undefined) return { text: text + ' Is this additional spending or replacing your usual purchase?', pending: request };
  } else if (request.intent === 'balance') {
    text = 'Your available money is ' + formatMoney(money.availableMoney) + '; total money across recorded accounts is ' + formatMoney(money.totalMoney) + '. Available money follows account inclusion settings, and is not a guarantee that all of it is free to spend.';
  } else if (request.intent === 'budget') {
    const row = budget;
    if (request.category && !row) return { text: 'No ' + request.category + ' budget is set for this month. You can add one in Plans.' };
    text = row ? row.category + ': ' + formatMoney(row.spent) + ' spent against ' + formatMoney(row.limitAmount) + ' for ' + readableReportingMonth(month) + '; ' + formatMoney(row.remaining) + ' remaining.' : report.rows.length ? 'For ' + readableReportingMonth(month) + ', budgeted categories have used ' + formatMoney(report.budgetedSpent) + ' of ' + formatMoney(report.totalLimit) + '. Check each category limit in Plans.' : 'No budgets are set for this month. You can add a category limit in Plans.';
  } else if (request.intent === 'spending') {
    if (/\b(last|yesterday|kahapon|today|ngayon|week)\b/i.test(request.text)) return { text: 'I can compare this month here. Use History for other reporting periods.' };
    const rows = spendingByCategory(context.transactions, month);
    const row = request.category ? rows.find((row) => row.category === request.category) : rows[0];
    const totals = calculateFinanceSummary(context.accounts, context.transactions, month);
    text = request.category ? 'Recorded ' + request.category + ' spending is ' + formatMoney(row?.amount ?? 0) + ' for ' + readableReportingMonth(month) + '.' : 'Recorded expenses are ' + formatMoney(totals.monthlyExpenses) + ' and income is ' + formatMoney(totals.monthlyIncome) + ' for ' + readableReportingMonth(month) + '.' + (row ? ' Your largest expense category is ' + row.category + ': ' + formatMoney(row.amount) + '.' : ' No expenses are recorded yet.');
    text += budget ? ' The category budget has ' + formatMoney(budget.remaining) + ' remaining.' : 'Without a relevant budget or target, I cannot determine whether that spending is too much.';
  } else if (request.intent === 'saving_plan') {
    if (request.amount === undefined) return clarification('How much would you contribute each month?');
    if (!request.months) return clarification('For how many months? For example, 6 months.');
    const added = safe(BigInt(request.amount) * BigInt(request.months));
    text = 'Contributing ' + formatMoney(request.amount) + ' each month for ' + request.months + ' months would add ' + formatMoney(added) + ' to savings, assuming every contribution is made and no withdrawals occur. This does not establish whether future income can cover those contributions.';
  } else {
    const savings = calculateSavings(context.accounts, context.transactions, month);
    const goals = context.goals.filter((goal) => request.text.toLowerCase().includes(goal.name.toLowerCase()));
    const goal = goals.length === 1 ? goals[0] : context.goals.length === 1 ? context.goals[0] : undefined;
    text = 'Your savings accounts hold ' + formatMoney(savings.balance) + '. Net transfers into savings this month are ' + formatMoney(savings.savedThisMonth) + '; transfers are not expenses.';
    if (request.amount !== undefined) text += ' A hypothetical purchase of ' + formatMoney(request.amount) + ' would leave ' + formatMoney(safe(BigInt(money.availableMoney) - BigInt(request.amount))) + ' available. Savings stay unchanged if you pay from spending funds; it may leave less money for future contributions.';
    if (goal) { const progress = calculateGoalProgress(goal, context.accounts, context.transactions); text += ' ' + goal.name + ' needs ' + formatMoney(progress.remaining) + ' more at the recorded balance. Future goal completion depends on contributions and withdrawals.'; }
    else if (context.goals.length) return clarification(text + ' Which goal would you like to review? ' + context.goals.map((goal) => goal.name).join(', ') + '.');
    else text += ' You can add a savings goal in Plans.';
  }
  return { text };
}
