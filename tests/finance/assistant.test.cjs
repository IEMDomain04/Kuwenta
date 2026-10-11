const test = require('node:test');
const assert = require('node:assert/strict');
const { cash, record } = require('./fixtures.cjs');
const { parseAssistantRequest: parse, answerAssistant: answer, recurringOccurrences } = require('../../.expo/finance-tests/assistant.js');
const now = new Date('2026-10-11T06:00:00Z');
const context = { accounts: [cash], transactions: [record()], budgets: [{ month: '2026-10', category: 'Food', limitAmount: 30000 }], goals: [] };
// Forty representative questions, including explicit Filipino/Taglish phrases.
const questions = [
 ['Can I buy a controller?', 'purchase'], ['Should I buy shoes for 500?', 'purchase'], ['Can I afford 2500?', 'purchase'], ['What if I spend 500 today?', 'purchase'], ['Kaya ko bang bumili ng sapatos 1500?', 'purchase'], ['Dapat ba bumili ng controller 500?', 'purchase'], ['Can I afford to eat outside?', 'purchase'], ['Could I purchase a keyboard?', 'purchase'],
 ['Can I eat mami every day for 60 pesos?', 'recurring'], ['What if I spend 100 daily?', 'recurring'], ['Coffee 80 every weekday for 2 weeks', 'recurring'], ['Mami 60 araw-araw', 'recurring'], ['Magkano gastos ko kung 80 araw araw?', 'recurring'], ['Rice 60 everyday for 30 days', 'recurring'], ['Fare 30 weekdays for 7 days', 'recurring'], ['Food 60 daily this month', 'recurring'],
 ['Where is my money going?', 'spending'], ['How much did I spend on food?', 'spending'], ['Am I spending too much on food?', 'spending'], ['Bakit parang ang bilis maubos ng pera ko?', 'spending'], ['Magkano gastos sa pagkain?', 'spending'], ['What is my income this month?', 'spending'], ['Highest spending category?', 'spending'], ['My expenses?', 'spending'],
 ['Explain my budget', 'budget'], ['Food budget remaining?', 'budget'], ['May budget ba?', 'budget'], ['Check my badyet', 'budget'],
 ['How much savings do I have?', 'savings'], ['Can I reach my laptop goal?', 'savings'], ['Magkano ipon ko?', 'savings'], ['Will this affect savings?', 'savings'],
 ['What is my balance?', 'balance'], ['Available money?', 'balance'], ['Magkano natitirang pera?', 'balance'], ['Total money?', 'balance'],
 ['What if I save 500 every month?', 'saving_plan'], ['Saving 1000 monthly for 6 months', 'saving_plan'], ['Mag-ipon 500 bawat buwan', 'saving_plan'], ['What is the weather?', 'unknown'],
];
for (const [question, expected] of questions) test('intent: ' + question, () => assert.equal(parse(question).intent, expected));

test('price and duration are independent and exact', () => {
 const request = parse('Food 60.50 daily for 30 days');
 assert.equal(request.amount, 6050); assert.equal(request.days, 30);
 const result = answer(request, context, now);
 assert.match(result.text, /1,815.00/); assert.match(result.text, /hypothetical/);
});
test('clarifications preserve the price and timeframe without mutating financial records', () => {
 const before = JSON.stringify(context);
 let request = parse('Can I buy a controller?');
 let result = answer(request, context, now); assert.match(result.text, /880.00.*How much/);
 request = parse('500', result.pending); result = answer(request, context, now);
 assert.match(result.text, /380.00/); assert.equal(result.pending, undefined);
 assert.equal(JSON.stringify(context), before);
});
test('recurring follow-ups and replacement costs compare the delta', () => {
 let request = parse('Mami 60 every day');
 let result = answer(request, context, now); assert.match(result.text, /timeframe/);
 request = parse('7 days', result.pending); result = answer(request, context, now); assert.match(result.text, /420.00/);
 request = parse('Replacement 50', result.pending); result = answer(request, context, now);
 assert.match(result.text, /70.00/); assert.match(result.text, /810.00/);
});
test('weekday counts and calendar month boundaries use real dates', () => {
 assert.equal(recurringOccurrences({ intent: 'recurring', text: '', frequency: 'weekdays', days: 7 }, '2026-10-11').count, 5);
 assert.equal(recurringOccurrences({ intent: 'recurring', text: '', frequency: 'daily', months: 0 }, '2026-10-11').count, 21);
 assert.equal(recurringOccurrences({ intent: 'recurring', text: '', frequency: 'daily', months: 1 }, '2026-01-31').count, 28);
});
test('invalid prices, mixed currencies, ambiguous numbers and excessive durations fail', () => {
 for (const phrase of ['Can I buy -50?', 'Can I buy 30k?', 'Can I buy 1.234?', 'Food 60 and 80 daily', 'Food 60 daily for 400 days', 'USD 60 daily', 'Save 500 monthly for 13 months']) assert.throws(() => parse(phrase), phrase);
});
test('goals and monthly contributions stay hypothetical; transfers remain excluded from expenses', () => {
 const saving = parse('What if I save 500 every month for 6 months?');
 assert.match(answer(saving, context, now).text, /3,000.00/);
 const result = answer(parse('Delete my balance'), context, now);
 assert.match(result.text, /only reads/);
 const noBudget = answer(parse('Am I spending too much on food?'), { ...context, budgets: [] }, now);
 assert.match(noBudget.text, /cannot determine/);
});


test('explicit account previews use that balance and cannot fall through to total available money', () => {
 const second = { ...cash, id: 'bank', name: 'Bank 2', openingBalance: 10000 };
 const expanded = { ...context, accounts: [cash, second] };
 assert.match(answer(parse('Can I buy shoes 200 from Bank 2?'), expanded, now).text, /exceeds.*100.00/);
 assert.match(answer(parse('Can I buy shoes 200 from Missing?'), expanded, now).text, /could not identify/);
 assert.match(answer(parse('Food budget?'), { ...context, budgets: [] }, now).text, /No Food budget/);
});


test('unsupported repetition and future starts cannot silently become one purchase', () => {
 for (const phrase of ['What if I spend 100 every week?', 'Coffee 60 every other day', 'Mami 60 daily starting tomorrow']) assert.throws(() => parse(phrase));
 assert.match(answer(parse('How much did I spend today?'), context, now).text, /other reporting periods/);
});
