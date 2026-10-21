import { formatMoney, parseMoney } from './money';

export type AssistantScenario = { text: string; amounts: number[] };
const money = (amount: number) => formatMoney(amount, true);
const safe = (amount: bigint) => amount >= BigInt(Number.MIN_SAFE_INTEGER) && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : undefined;

/** Keep scenario quantities separate from a product's price. */
export function scenarioInputs(question: string) {
  const reserveMatch = question.match(/\b(?:keep|leave|reserve|set aside)\s*(?:\u20b1|php)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?![\d.])\s*(k)?(?:\s*pesos?)?/i);
  let reserve: number | undefined;
  if (reserveMatch) {
    try { reserve = safe(BigInt(parseMoney(reserveMatch[1].replace(/,/g, ''), { allowZero: true })) * (reserveMatch[2] ? 1000n : 1n)); } catch {}
  }
  const frequencyMatch = question.match(/\b(once|twice|one|two|three|four|five|six|seven|\d{1,3})\s*(?:times?|days?)?\s*(?:a|per|each)\s*week\b/i);
  const words: Record<string, number> = { once: 1, twice: 2, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const count = frequencyMatch ? words[frequencyMatch[1].toLowerCase()] ?? Number(frequencyMatch[1]) : undefined;
  const weeklyCount = count !== undefined && count > 0 && count <= (/days?/i.test(frequencyMatch![0]) ? 7 : 100) ? count : undefined;
  const priceText = question.replace(reserveMatch?.[0] ?? /$^/, '').replace(frequencyMatch?.[0] ?? /$^/, '');
  return { reserve, weeklyCount, priceText, noSpending: /(?:buy|spend)\s+(?:nothing|no money)|(?:no|without) spending/i.test(question) };
}

export function reserveScenario(available: number, price: number, reserve: number): AssistantScenario | undefined {
  const remainder = safe(BigInt(available) - BigInt(price) - BigInt(reserve));
  if (remainder === undefined) return undefined;
  const amounts = [reserve, price, remainder];
  const comparison = remainder < 0 ? 'you would need ' + money(-remainder) + ' more to cover ' + (price ? 'both the purchase and that amount' : 'that amount') : money(remainder) + ' would remain beyond it' + (price ? ' after the purchase' : ' for other uses');
  if (remainder < 0) amounts.push(-remainder);
  return { text: 'If you chose to keep ' + money(reserve) + ' untouched, ' + comparison + '. This is a what-if comparison; no money has been reserved.', amounts };
}

export function cheaperScenario(available: number, price: number): AssistantScenario | undefined {
  if (available <= 0 || price <= available) return undefined;
  // One illustrative price, keeping one fifth of the available balance. Never a market quote.
  const alternative = Number(BigInt(available) * 4n / 5n / 100n * 100n);
  if (alternative <= 0) return undefined;
  return { text: 'For comparison only, an illustrative ' + money(alternative) + ' option would leave ' + money(available - alternative) + '. This is not a verified product price or a guarantee that the remainder covers your needs.', amounts: [alternative, available - alternative] };
}

export function frequencyScenario(available: number, unitPrice: number): AssistantScenario | undefined {
  const total = safe(BigInt(unitPrice) * 3n);
  if (total === undefined) return undefined;
  const left = safe(BigInt(available) - BigInt(total));
  if (left === undefined) return undefined;
  return { text: 'For comparison, if you bought it three times in one week, the cost would be ' + money(total) + ', leaving ' + money(left) + ' before other expenses. This assumes no other balance changes.', amounts: [unitPrice, total, left] };
}

export function goalScenario(remaining: number, available: number, contribution?: number, monthly = false): AssistantScenario | undefined {
  if (remaining <= 0 || (contribution === undefined && available <= 0)) return undefined;
  const illustrative = Math.min(remaining, available, Number((BigInt(remaining) + 999n) / 1000n * 100n));
  const amount = contribution ?? illustrative;
  if (!Number.isSafeInteger(amount) || amount <= 0) return undefined;
  const periods = Number((BigInt(remaining) + BigInt(amount) - 1n) / BigInt(amount));
  return { text: 'If you could set aside ' + money(amount) + ' each ' + (monthly ? 'month' : 'week') + ', the remaining ' + money(remaining) + ' would take ' + periods + (monthly ? ' months' : ' weeks') + ', assuming no withdrawals. This is conditional, not a prediction of future income.', amounts: [remaining, amount] };
}

export function categoryScenario(category: string, spent: number): AssistantScenario | undefined {
  if (spent <= 1) return undefined;
  const alternative = Number(BigInt(spent) * 3n / 4n);
  const difference = spent - alternative;
  return { text: 'For comparison, if you chose an illustrative ' + money(alternative) + ' limit for ' + category + ' next month instead of ' + money(spent) + ', ' + money(difference) + ' could stay available elsewhere, assuming all other activity stayed the same. This is not a forecast or a saved budget.', amounts: [spent, alternative, difference] };
}
