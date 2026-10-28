import type { Account, TransactionDraft } from './types';
import { philippineDateTime, isValidDate } from './dates';
import { parseMoney } from './money';
import { defaultEntryAccount } from './workflows';

const expenseKeywords: [string, RegExp][] = [
  ['Meals', /\b(lunch|breakfast|dinner|meal|meals|food|rice|mami|pagkain|almusal|tanghalian|hapunan)\b/i],
  ['Snacks', /\b(snack|snacks|chips|biscuit|biscuits)\b/i],
  ['Drinks', /\b(juice|soda|drink|drinks)\b/i],
  ['Café', /\b(coffee|cafe|kape|latte)\b|\bcaf\u00e9(?=\s|$)/i],
  ['Groceries', /\b(groceries|grocery|palengke)\b/i],
  ['Personal Care', /\b(toothbrush|toothpaste|shampoo|deodorant|personal care|bath soap)\b/i],
  ['Cleaning Supplies', /\b(detergent|bleach|dishwashing|dish soap|cleaning|cleaner|broom|mop|panlinis|sabong panlaba)\b/i],
  ['Mobile Load', /\b(load|prepaid|airtime|reload|paload|nagpaload)\b/i],
  ['Mobile Data', /\b(data promo|mobile data)\b/i],
  ['Games', /\b(game|games|gaming)\b/i],
  ['Entertainment', /\b(movie|cinema|entertainment|sine)\b/i],
  ['Tech', /\b(keyboard|mouse|gadget|gadgets|tech|headphones|earphones)\b/i],
  ['Accessories', /\b(charger|accessory|accessories|phone case|cable)\b/i],
  ['School Supplies', /\b(school supplies|printing|notebook|pen)\b/i],
  ['Personal Items', /\b(bag|backpack|personal items)\b/i],
  ['Fees', /\b(fee|fees|charge|charges)\b/i],
  ['Transport', /\b(pamasahe|fare|jeep|bus|taxi|transport|transportation|gas|gasolina)\b/i],
  ['Shopping', /\b(shopping|clothes|damit)\b/i],
  ['Bills', /\b(bill|bills|electricity|water|internet|rent|kuryente|tubig|upa)\b/i],
  ['Health', /\b(medicine|doctor|health|gamot)\b/i],
  ['Education', /\b(tuition|education)\b/i],
  ['Subscriptions', /\b(subscription|netflix|spotify)\b/i],
];
const incomeKeywords: [string, RegExp][] = [
  ['Savings Interest', /\b(savings interest|bank interest|interest credited)\b/i],
  ['Part-time Work', /\b(part[ -]?time|sideline)\b/i],
  ['Salary', /\b(salary|sahod|sweldo)\b/i], ['Allowance', /\b(allowance|baon)\b/i],
  ['Freelance', /\b(freelance)\b/i], ['Business', /\b(business)\b/i],
];
/** Pure, bounded phrase parsing. It never saves records or calls a service. */
export function parseQuickEntry(text: string, accounts: readonly Account[], now = new Date(), context?: string, lastUsed?: string): { draft: TransactionDraft; warnings: string[] } {
  if (!text.trim() || text.length > 250) throw new Error('Enter one short transaction, up to 250 characters.');
  let phrase = text.trim();
  if (/[\n;]|\b(?:usd|dollars|eur|euro)\b|\$/i.test(phrase)) throw new Error('Use one PHP transaction per phrase.');
  let accountId = defaultEntryAccount(accounts, context, lastUsed);
  let destinationAccountId: string | undefined;
  const transfer = /\b(cash[ -]?in|cash[ -]?out|transfer|lipat|move)\b/i.test(phrase) && !/\b(fee|fees|charge|charges)\b/i.test(phrase);
  function findAccount(name: string): Account {
    const matches = accounts.filter((account) => account.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (matches.length !== 1) throw new Error('Use one exact account name.');
    if (matches[0].archived) throw new Error('That account is archived. Choose an active account.');
    return matches[0];
  }
  if (transfer) {
    const endpoints = phrase.match(/\b(?:from|using)\s+(.+?)\s+to\s+(.+)$/i);
    if (!endpoints) throw new Error(/\bto\b/i.test(phrase) ? 'Which account is the money from? Use: Cash in 500 from Cash to GCash.' : 'Include both accounts: Cash in 500 from Cash to GCash.');
    accountId = findAccount(endpoints[1]).id;
    destinationAccountId = findAccount(endpoints[2]).id;
    if (accountId === destinationAccountId) throw new Error('Choose two different accounts.');
    phrase = phrase.slice(0, endpoints.index).trim();
  } else {
    const accountClause = phrase.match(/\b(?:from|using|sa account)\s+(.+)$/i);
    if (accountClause) {
      accountId = findAccount(accountClause[1]).id;
      phrase = phrase.slice(0, accountClause.index).trim();
    }
  }
  if (!accounts.some((account) => account.id === accountId && !account.archived)) throw new Error('Choose an active account first.');
  if (/\b(refund|utang|borrow|loan|external)\b/i.test(phrase)) throw new Error('Use the regular form for this money movement.');
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
  if (transfer) return { draft: { type: 'TRANSFER', accountId, destinationAccountId, category: 'Transfer', amount, transactionDate, transactionTime: defaults.transactionTime, notes: description || undefined }, warnings: [] };
  const gift = /\b(gifts?|regalo|pangregalo)\b/i.test(description);
  const explicitIncome = /\b(income|received|earned|kita|natanggap|nakatanggap)\b/i.test(description);
  const explicitExpense = /\b(expense|spent|paid|bought|buy|gave|give|gastos|bayad|bumili|binili|ibinigay|nagregalo|pangregalo)\b/i.test(description)
    || gift && /\b(?:gifts?|regalo)\s+(?:for|para)\b/i.test(description);
  if (gift && !explicitIncome && !explicitExpense) throw new Error('Was this a gift you received or bought? Use "Received gift 500" or "Bought gift 500".');
  const incomes = incomeKeywords.filter(([, pattern]) => pattern.test(description));
  if (gift && explicitIncome) incomes.push(['Gifts', /gift/i]);
  const expenses = gift && explicitExpense ? [['Gifts', /gift/i] as [string, RegExp]] : expenseKeywords.filter(([, pattern]) => pattern.test(description));
  if ((explicitIncome || incomes.length) && (explicitExpense || expenses.length)) throw new Error('Income or expense is unclear. Use the regular form or simplify the phrase.');
  const type = explicitIncome || incomes.length ? 'INCOME' : 'EXPENSE';
  const matches = type === 'INCOME' ? incomes : expenses;
  if (matches.length > 1) throw new Error('More than one category matches. Use one transaction description or select a category in the regular form.');
  const category = matches[0]?.[0] ?? (type === 'INCOME' ? 'Other Income' : 'Other');
  return { draft: { type, accountId, category, amount, transactionDate, transactionTime: defaults.transactionTime, notes: description || undefined },
    warnings: matches.length === 0 ? ['Choose a category before saving.'] : [] };
}
