import type { Account, TransactionDraft } from './types';
import { philippineDateTime, isValidDate } from './dates';
import { parseMoney } from './money';
import { defaultEntryAccount } from './workflows';

const expenseKeywords: [string, RegExp][] = [
  ['Food', /\b(lunch|breakfast|dinner|food|coffee|pagkain|kape|almusal|tanghalian|hapunan)\b/i],
  ['Transportation', /\b(pamasahe|fare|jeep|bus|taxi|transport|transportation|gas|gasolina)\b/i],
  ['Shopping', /\b(groceries|grocery|shopping|clothes|damit)\b/i],
  ['Bills', /\b(bill|bills|electricity|water|internet|rent|kuryente|tubig|upa)\b/i],
  ['Entertainment', /\b(movie|cinema|entertainment|sine)\b/i],
  ['Health', /\b(medicine|doctor|health|gamot)\b/i],
  ['Education', /\b(tuition|school|education)\b/i],
  ['Subscriptions', /\b(subscription|netflix|spotify)\b/i],
];
const incomeKeywords: [string, RegExp][] = [
  ['Salary', /\b(salary|sahod|sweldo)\b/i], ['Allowance', /\b(allowance|baon)\b/i],
  ['Freelance', /\b(freelance)\b/i], ['Gift', /\b(gift|regalo)\b/i], ['Business', /\b(business)\b/i],
];
/** Pure, bounded phrase parsing. It never saves records or calls a service. */
export function parseQuickEntry(text: string, accounts: readonly Account[], now = new Date(), context?: string, lastUsed?: string): { draft: TransactionDraft; warnings: string[] } {
  if (!text.trim() || text.length > 250) throw new Error('Enter one short income or expense, up to 250 characters.');
  let phrase = text.trim();
  if (/[\n;]|\b(?:usd|dollars|eur|euro)\b|\$/i.test(phrase)) throw new Error('Use one PHP transaction per phrase.');
  let accountId = defaultEntryAccount(accounts, context, lastUsed);
  const accountClause = phrase.match(/\b(?:from|using|sa account)\s+(.+)$/i);
  if (accountClause) {
    const matches = accounts.filter((account) => account.name.trim().toLowerCase() === accountClause[1].trim().toLowerCase());
    if (matches.length !== 1) throw new Error('Name one exact account after "from", or select the account in the regular form.');
    if (matches[0].archived) throw new Error('That account is archived. Choose an active account.');
    accountId = matches[0].id;
    phrase = phrase.slice(0, accountClause.index).trim();
  }
  if (!accounts.some((account) => account.id === accountId && !account.archived)) throw new Error('Choose an active account in the regular form first.');
  if (/\b(transfer|lipat|move|refund|utang|borrow|loan)\b/i.test(phrase)) throw new Error('Quick Entry supports ordinary income and expenses. Use the regular form for transfers or unclear money movements.');
  if (/\b(tomorrow|bukas|last|ago|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|kahapon|today|ngayon|yesterday)\b/i.test(phrase.replace(/\b(today|ngayon|yesterday|kahapon)\b/gi, ''))) throw new Error('Use today, yesterday, ngayon, or kahapon; choose other dates in the regular form.');
  const defaults = philippineDateTime(now);
  const dateWords = [...phrase.matchAll(/\b(today|ngayon|yesterday|kahapon)\b/gi)];
  if (dateWords.length > 1) throw new Error('Use only one transaction date.');
  let transactionDate = defaults.transactionDate;
  if (dateWords[0] && /yesterday|kahapon/i.test(dateWords[0][0])) {
    const previous = new Date(transactionDate + 'T12:00:00Z');
    previous.setUTCDate(previous.getUTCDate() - 1);
    transactionDate = previous.toISOString().slice(0, 10);
    if (!isValidDate(transactionDate)) throw new Error('Date is outside the supported range.');
  }
  phrase = phrase.replace(/\b(today|ngayon|yesterday|kahapon)\b/gi, '').trim();
  phrase = phrase.replace(/\bPHP(?=\d)/gi, 'PHP ');
  const numbers = [...phrase.matchAll(/[-+]?\d[\d,.]*(?:[a-z]+)?/gi)];
  if (numbers.length !== 1) throw new Error('Include exactly one amount. Record multiple transactions separately.');
  const amountText = numbers[0][0];
  const amountIndex = numbers[0].index!;
  if (amountIndex > 0 && /[a-z0-9.,+-]/i.test(phrase[amountIndex - 1])) throw new Error('Separate the amount from the description and include a whole peso digit, such as 0.50.');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amountText)) throw new Error('Use a positive amount such as 120 or 1,500.50; shortcuts like 30k are not supported.');
  const amount = parseMoney(amountText.replace(/,/g, ''));
  const description = (phrase.slice(0, numbers[0].index) + phrase.slice(numbers[0].index! + amountText.length)).replace(/\b(php|pesos|peso)\b/gi, '').replace(/\u20b1/g, '').replace(/\s+/g, ' ').trim();
  const incomes = incomeKeywords.filter(([, pattern]) => pattern.test(description));
  const expenses = expenseKeywords.filter(([, pattern]) => pattern.test(description));
  const explicitIncome = /\b(income|received|earned|kita|natanggap)\b/i.test(description);
  const explicitExpense = /\b(expense|spent|paid|gastos|bayad)\b/i.test(description);
  if ((explicitIncome || incomes.length) && (explicitExpense || expenses.length)) throw new Error('Income or expense is unclear. Use the regular form or simplify the phrase.');
  const type = explicitIncome || incomes.length ? 'INCOME' : 'EXPENSE';
  const matches = type === 'INCOME' ? incomes : expenses;
  if (matches.length > 1) throw new Error('More than one category matches. Use one transaction description or select a category in the regular form.');
  const category = matches[0]?.[0] ?? 'Other';
  return { draft: { type, accountId, category, amount, transactionDate, transactionTime: defaults.transactionTime, notes: description || undefined },
    warnings: [category === 'Other' ? 'Category could not be identified. Review Other or choose a category.' : 'Category is a suggestion. Review all details before saving.', 'Time defaults to now; change it if needed.'] };
}
