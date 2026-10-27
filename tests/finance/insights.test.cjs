const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moneyInsights, accountInsights, moneyInsightReaction } = require('../../.expo/finance-tests/insights.js');
const { cash, record } = require('./fixtures.cjs');
const now = new Date('2026-10-11T02:00:00Z');
const budget = limitAmount => [{ month: '2026-10', category: 'Food', limitAmount }];
const saving = { ...cash, id: 'save', name: 'Savings', openingBalance: 0, purpose: 'savings', includedInAvailable: false };

test('empty activity avoids spending feedback and shows a concise available-money summary', () => {
  assert.deepEqual(moneyInsights([cash], [], [], [], now), []);
  const result = accountInsights([cash], [], [], now);
  assert.equal(result.totalMoney, 100000);
  assert.equal(result.availableMoney, 100000);
  assert.equal(result.insights.length, 1);
  assert.match(result.insights[0], /available for spending/);
});
test('budget warnings precede observations and use the current month only', () => {
  const rows = [record(), record({ id: 'older', amount: 9000, transactionDate: '2026-09-09' })];
  const result = moneyInsights([cash], rows, budget(15000), [], now);
  assert.match(result[0], /80%.*30 remaining/);
  assert.ok(result.some(text => /120 recorded/.test(text) && text.includes('October 2026')));
  assert.ok(result.every(text => !/expenses exceed income/.test(text)));
  assert.equal(moneyInsightReaction(result[0]), 'thinking');
});
test('limit reached and overspending take priority over successful income', () => {
  const rows = [record({ amount: 15000 }), record({ id: 'income', type: 'INCOME', category: 'Freelance', amount: 200000 })];
  assert.match(moneyInsights([cash], rows, budget(15000), [], now)[0], /limit reached/);
  assert.match(moneyInsights([cash], [record({ amount: 16000 }), rows[1]], budget(15000), [], now)[0], /10 over budget/);
});
test('income source totals exclude transfers, external movements and future income', () => {
  const rows = [
    record({ id: 'a', type: 'INCOME', category: 'Freelance', amount: 50000 }),
    record({ id: 'b', type: 'INCOME', category: 'Freelance', amount: 40000 }),
    record({ id: 'c', type: 'INCOME', category: 'Salary', amount: 80000 }),
    record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', adjustmentDirection: 'increase', externalName: 'Friend', amount: 900000 }),
    record({ id: 'future', type: 'INCOME', category: 'Salary', amount: 900000, transactionDate: '2026-10-12' }),
    record({ id: 'move', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 20000 }),
  ];
  const messages = moneyInsights([cash, saving], rows, [], [], now);
  assert.ok(messages.some(text => /Freelance brought in.*900.*largest income source/.test(text)));
  assert.ok(!messages.some(text => /Salary brought|expenses exceed/.test(text)));
});
test('transfers are not income or expenses and savings goals retain exact progress', () => {
  const transfer = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 50000, sourcePurpose: 'spending', destinationPurpose: 'savings' });
  const goal = { id: 'goal', name: 'Emergency', accountId: 'save', targetAmount: 100000, createdAt: record().createdAt, updatedAt: record().updatedAt };
  const result = moneyInsights([cash, saving], [transfer], [], [goal], now);
  assert.match(result[0], /transferred into savings/);
  assert.match(result[1], /50% funded/);
  assert.ok(result.every(text => !text.includes('expense category')));
  assert.ok(moneyInsights([cash, saving], [transfer], [], [{ ...goal, targetAmount: 50000 }], now).some(text => text.includes('target reached')));
});
test('editing and deleting records recalculates insights without mutation', () => {
  const rows = Object.freeze([Object.freeze(record({ amount: 16000 }))]);
  assert.match(moneyInsights([cash], rows, budget(15000), [], now)[0], /over budget/);
  assert.ok(!moneyInsights([cash], [record({ amount: 1000 })], budget(15000), [], now).some(text => text.includes('over budget')));
  assert.deepEqual(moneyInsights([cash], [], budget(15000), [], now), []);
  assert.equal(rows[0].amount, 16000);
});
test('spending comparisons use matched dates and omit unavailable comparisons', () => {
  const rows = [record({ amount: 12000 }), record({ id: 'previous', amount: 10000, transactionDate: '2026-09-09' }), record({ id: 'later', amount: 900000, transactionDate: '2026-09-20' })];
  assert.ok(moneyInsights([cash], rows, [], [], now).some(text => /20 higher/.test(text) && /days 1-11/.test(text)));
  assert.ok(!moneyInsights([cash], [rows[0]], [], [], now).some(text => /compared/.test(text)));
  const end = new Date('2026-03-31T02:00:00Z');
  const matched = [record({ amount: 12000, transactionDate: '2026-03-27' }), record({ id: 'prior', amount: 10000, transactionDate: '2026-02-27' }), record({ id: 'unmatched', amount: 90000, transactionDate: '2026-03-31' })];
  assert.ok(moneyInsights([cash], matched, [], [], end).some(text => /20 higher/.test(text) && /days 1-28/.test(text)));
});
test('remaining budget allowances sum positive category balances, not overspending offsets', () => {
  const rows = [record({ amount: 16000 })];
  const budgets = [...budget(10000), { month: '2026-10', category: 'Transportation', limitAmount: 90000 }];
  const result = moneyInsights([cash], rows, budgets, [], now);
  assert.ok(result.some(text => /840.*below.*900/.test(text)));
  const funded = moneyInsights([cash], [record()], budget(15000), [], now);
  assert.ok(funded.some(text => /exceeds remaining budget limits.*850/.test(text) && /bills/.test(text)));
});
test('the main insight and up to four relevant details are retained without duplicates', () => {
  const rows = [record(), record({ id: 'income', type: 'INCOME', category: 'Freelance', amount: 5000 }), record({ id: 'prior', transactionDate: '2026-09-09', amount: 1000 })];
  const result = moneyInsights([cash], rows, budget(15000), [], now);
  assert.ok(result.length > 3 && result.length <= 5);
  assert.equal(new Set(result).size, result.length);
  assert.ok(result.some(text => /Freelance/.test(text)));
});
test('account balance breakdown includes archived and excluded accounts consistently', () => {
  const archived = { ...cash, id: 'old', name: 'Old wallet', openingBalance: 20000, archived: true };
  const result = accountInsights([cash, { ...saving, openingBalance: 40000 }, archived], [], [], now);
  assert.equal(result.totalMoney, 160000);
  assert.equal(result.availableMoney, 120000);
  assert.equal(result.balances.length, 3);
  assert.ok(result.insights.some(text => /Old wallet is archived.*200.*included in Total Money/.test(text)));
  assert.ok(result.insights.some(text => /400 in savings accounts.*available for spending/.test(text)));
});
test('negative balances are the first account insight and savings concentration gets useful feedback', () => {
  const accounts = [{ ...cash, openingBalance: -10000 }, { ...saving, openingBalance: 100000 }];
  const result = accountInsights(accounts, [], [], now);
  assert.match(result.insights[0], /Cash.*negative.*100/);
  assert.ok(result.insights.some(text => /in savings accounts.*available for spending/.test(text)));
  const concentrated = accountInsights([{ ...cash, openingBalance: 5000 }, { ...saving, openingBalance: 100000 }], [], [], now);
  assert.ok(concentrated.insights.some(text => /in savings accounts.*50.*available/.test(text)));
});
test('account spending feedback names the account and excludes past or future activity', () => {
  const result = accountInsights([cash], [record({ amount: 30000 })], [], now);
  assert.ok(result.insights.some(text => /300 in expenses from Cash.*October 2026/.test(text)));
  assert.ok(accountInsights([cash], [record({ amount: 20000 })], [], now).insights.some(text => /200 in expenses from Cash/.test(text)));
  for(const date of ['2026-08-01','2026-10-12']) assert.ok(accountInsights([cash], [record({transactionDate:date})], [], now).insights.every(text => !text.includes('in expenses from')));
});

test('transfers explain account movement without calling the principal spending', () => {
  const transfer = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 30000 });
  const result = accountInsights([cash, saving], [transfer], [], now);
  assert.equal(result.totalMoney, cash.openingBalance);
  assert.match(result.insights[0], /300 moved from Cash to Savings.*not spending/);
  assert.ok(result.insights.every(text => !/in expenses from|fell by/.test(text)));
});

test('tied categories are identified honestly and future expenses do not trigger warnings', () => {
  const income = category => record({ id: category, type: 'INCOME', category, amount: 50000 });
  assert.ok(moneyInsights([cash], [income('Salary'), income('Freelance')], [], [], now).some(text => /tied for your largest income source/.test(text)));
  assert.deepEqual(moneyInsights([cash], [record({ transactionDate: '2026-10-12' })], budget(1000), [], now), []);
});


test('account feedback includes savings and actual spending while preserving centavos', () => {
  const result = accountInsights([cash, { ...saving, openingBalance: 200050 }], [record({ amount: 12025 })], [], now);
  assert.match(result.insights[0], /120.25 in expenses from Cash/);
  assert.ok(result.insights.some(text => /2,000.50 in savings accounts.*879.75 available/.test(text)));
});

test('account spending summary excludes transfers, corrections, external funds and future expenses', () => {
  const rows = [
    record({ amount: 10050 }),
    record({ id: 'old', amount: 5000, transactionDate: '2026-09-01' }),
    record({ id: 'future', amount: 1000, transactionDate: '2026-10-12' }),
    record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', adjustmentDirection: 'increase', externalName: 'Friend', amount: 5000 }),
    record({ id: 'correction', type: 'ADJUSTMENT', category: 'Balance adjustment', adjustmentDirection: 'increase', amount: 1000 }),
    record({ id: 'transfer', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 2000 }),
  ];
  const accounts = [cash, { ...saving, purpose: 'spending', includedInAvailable: true }];
  const result = accountInsights(accounts, rows, [], now);
  assert.ok(result.insights.some(text => /100.50 in expenses from Cash in October 2026/.test(text)));
  assert.equal(result.availableMoney,89950);
  assert.ok(result.insights.every(text => !/110.50 in expenses|150.50 in expenses/.test(text)));
  const empty = accountInsights([{ ...cash, openingBalance: 0 }], [], [], now);
  assert.deepEqual(empty.insights, ['Add your starting balances to see your money overview.']);
});


test('ordinary student spending with no income gets factual, friendly feedback', () => {
 const rows = Object.freeze([
  Object.freeze(record({ category: 'Meals', amount: 12000 })),
  Object.freeze(record({ id: 'fare', category: 'Transport', amount: 3000 })),
 ]);
 const before = JSON.stringify(rows);
 const messages = moneyInsights([cash], rows, [], [], now);
 assert.ok(messages.some(text => /Meals.*120 recorded/.test(text)));
 assert.ok(messages.every(text => !/exceed income|need.*job|over budget|negative recorded balance/.test(text)));
 assert.equal(moneyInsightReaction(messages[0]), 'friendly');
 assert.equal(JSON.stringify(rows), before);
 const smallIncome = record({ id: 'allowance', type: 'INCOME', category: 'Allowance', amount: 1000 });
 assert.ok(moneyInsights([cash], [...rows, smallIncome], [], [], now).every(text => !/exceed income/.test(text)));
 assert.equal(moneyInsightReaction('Your money story starts here.'), 'friendly');
});

test('clear funding problems remain concerned while budget reminders stay calm', () => {
 const first = (accounts, rows, budgets) => moneyInsights(accounts, rows, budgets, [], now)[0];
 assert.equal(moneyInsightReaction(first([cash], [record()], budget(10000))), 'concerned');
 assert.equal(moneyInsightReaction(first([cash], [record()], budget(12000))), 'thinking');
 assert.equal(moneyInsightReaction(first([cash], [record()], budget(15000))), 'thinking');
 const negative = first([{ ...cash, openingBalance: 1000 }], [record()], []);
 assert.match(negative, /Cash has a negative recorded balance/);
 assert.equal(moneyInsightReaction(negative), 'concerned');
 const gap = first([{ ...cash, openingBalance: 15000 }], [record()], budget(20000));
 assert.match(gap, /available, below/);
 assert.equal(moneyInsightReaction(gap), 'concerned');
 const future = moneyInsights([{ ...cash, openingBalance: 0 }], [record({ transactionDate: '2026-10-12' })], [], [], now);
 assert.deepEqual(future, []);
});

test('within-budget spending, saving and goals produce supportive expressions', () => {
 const within = moneyInsights([cash], [record()], budget(30000), [], now)[0];
 assert.match(within, /budgeted categories are within their limits/);
 assert.equal(moneyInsightReaction(within), 'encouraging');
 const into = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 10000, sourcePurpose: 'spending', destinationPurpose: 'savings' });
 const goal = { id: 'goal', name: 'Laptop', accountId: 'save', targetAmount: 10000, createdAt: into.createdAt, updatedAt: into.updatedAt };
 const messages = moneyInsights([cash, saving], [into], [], [goal], now);
 assert.equal(moneyInsightReaction(messages[0]), 'celebrating');
 assert.equal(moneyInsightReaction(messages.find(text => /transferred into savings/.test(text))), 'encouraging');
 const funded = moneyInsights([cash, saving], [into], [], [{ ...goal, targetAmount: 20000 }], now);
 assert.equal(moneyInsightReaction(funded.find(text => /50% funded/.test(text))), 'encouraging');
});

test('higher spending and savings withdrawals are observations, not sad reactions', () => {
 const rows = [record(), record({ id: 'prior', amount: 10000, transactionDate: '2026-09-09' })];
 const higher = moneyInsights([cash], rows, [], [], now).find(text => /higher compared with/.test(text));
 assert.ok(higher);
 assert.equal(moneyInsightReaction(higher), 'thinking');
 const out = record({ type: 'TRANSFER', category: 'Transfer', accountId: 'save', destinationAccountId: 'cash', amount: 10000, sourcePurpose: 'savings', destinationPurpose: 'spending' });
 const withdrawal = moneyInsights([cash, { ...saving, openingBalance: 20000 }], [out], [], [], now)[0];
 assert.match(withdrawal, /transferred out of savings/);
 assert.equal(moneyInsightReaction(withdrawal), 'thinking');
});

const debtEntry = (overrides={}) => ({id:'loan',name:'Ana',kind:'owed',amount:50000,accountId:'cash',transactionDate:'2026-10-01',transactionTime:'10:00:00',createdAt:'2026-10-01T02:00:00.000Z',updatedAt:'2026-10-01T02:00:00.000Z',...overrides});
const paymentEntry = {id:'paid',debtId:'loan',amount:20000,accountId:'cash',transactionDate:'2026-10-02',transactionTime:'10:00:00',createdAt:'2026-10-02T02:00:00.000Z'};
const addedEntry = {id:'more',debtId:'loan',amount:15000,accountId:'cash',transactionDate:'2026-10-03',transactionTime:'10:00:00',createdAt:'2026-10-03T02:00:00.000Z'};

test('Home debt insights include later borrowing, partial repayments and both directions without changing money',()=>{
 const context={debts:[debtEntry(),debtEntry({id:'owe',kind:'owe',amount:30000,existing:true,accountId:undefined})],payments:[paymentEntry],additions:[addedEntry]};
 const before=JSON.stringify(context), {debtMovement,debtAdditionMovement}=require('../../.expo/finance-tests/debts.js');
 const movements=[debtMovement(context.debts[0]),debtMovement(context.debts[0],paymentEntry),debtAdditionMovement(context.debts[0],addedEntry)];
 const messages=moneyInsights([cash],movements,[],[],now,context);
 assert.ok(messages.some(text=>/450 is still owed to you.*not included/.test(text)));
 assert.ok(messages.some(text=>/300 left to repay/.test(text)));
 assert.ok(messages.every(text=>!/expense category|largest income source/.test(text)));
 assert.equal(JSON.stringify(context),before);
 const result=accountInsights([cash],movements,[],now,context);
 assert.match(result.insights[0],/lent.*650.*received.*200 back.*450 remains owed/);
 assert.equal(result.totalMoney,55000);
});

test('tracking-only debts explain what remains owed without inventing lending or repayments',()=>{
 const context={debts:[debtEntry({existing:true,accountId:undefined})],payments:[],additions:[{...addedEntry,existing:true,accountId:undefined}]};
 const home=moneyInsights([cash],[],[],[],now,context);
 assert.ok(home.some(text=>/650 is still owed to you/.test(text)));
 const account=accountInsights([cash],[],[],now,context);
 assert.equal(account.totalMoney,cash.openingBalance);assert.ok(account.insights.every(text=>!text.includes('You lent')));
 const settled={...context,payments:[{...paymentEntry,amount:65000}]};
 assert.ok(moneyInsights([cash],[],[],[],now,settled).every(text=>!text.includes('still owed')));
 const future={debts:[debtEntry({transactionDate:'2026-10-12'})],payments:[],additions:[]};
 assert.deepEqual(moneyInsights([cash],[],[],[],now,future),[]);
});

test('cash-in/out fee insights exclude exchanged principal, service losses and ordinary Fees entries',()=>{
 const {exchangeDraft,exchangeRecords}=require('../../.expo/finance-tests/exchanges.js');
 const exchange=(id,kind,paid,received)=>exchangeRecords(id,exchangeDraft('cash',{kind,paid,received,receivedAccountId:'save',extraAccountId:'cash',earningsConfirmed:true},'2026-10-09','10:00:00'),record().createdAt);
 const rows=[...exchange('in','E-bank Cash-in',20400,20000),...exchange('out','E-bank Cash-out',10000,9800),...exchange('service','Service sale',1000,900),record({id:'other-fee',category:'Fees',amount:500})];
 const result=accountInsights([cash,saving],rows,[],now);
 assert.ok(result.insights.some(text=>/fees totaled.*6 in October 2026/.test(text)));
 assert.equal(result.totalMoney,98800);
 const equal=accountInsights([cash,saving],exchange('equal','E-bank Cash-in',10000,10000),[],now);
 assert.ok(equal.insights.every(text=>!text.includes('fees totaled')));
});

test('Home and Accounts keep one main insight plus at most four others with warnings first',()=>{
 const accounts=[{...cash,openingBalance:-1000},{...saving,openingBalance:200000},{...cash,id:'old',name:'Old account',openingBalance:50000,archived:true}];
 const rows=[record({category:'Meals'}),record({id:'fare',category:'Transport',amount:5000}),record({id:'income',type:'INCOME',category:'Freelance',amount:1000})];
 const budgets=[{month:'2026-10',category:'Meals',limitAmount:10000},{month:'2026-10',category:'Transport',limitAmount:5000}];
 const home=moneyInsights(accounts,rows,budgets,[],now), account=accountInsights(accounts,rows,budgets,now);
 for(const messages of [home,account.insights]){assert.ok(messages.length<=5);assert.equal(new Set(messages).size,messages.length);assert.match(messages[0],/negative recorded balance/);}
});

test('overlapping daily weekly and overall budgets stay separate, with exceeded limits before near limits',()=>{
 const budgets=[{month:'daily:2026-10-11',category:'Meals',limitAmount:12500},{month:'weekly:2026-10-05',category:'Meals',limitAmount:10000},{month:'2026-10',category:'Overall spending',limitAmount:50000},{month:'2026-10',category:'Transport',limitAmount:90000}];
 const rows=[record({category:'Meals',transactionDate:'2026-10-11'})];
 const result=moneyInsights([cash],rows,budgets,[],now);
 assert.match(result[0],/20 over budget/);
 assert.ok(result.some(text=>/96%/.test(text)));
 // Overall remaining is 380, not the sum of the overlapping category/scope limits.
 assert.ok(!result.some(text=>/available, below/.test(text)));
});

test('student feedback is neutral and future goals do not trigger a premature celebration',()=>{
 const home=moneyInsights([cash],[record({amount:60000})],[],[],now);
 assert.ok(home.some(text=>/600 in expenses.*starting money too/.test(text)));
 assert.equal(moneyInsightReaction(home[0]),'friendly');
 const future=record({id:'future-goal',type:'TRANSFER',category:'Transfer',destinationAccountId:'save',amount:50000,transactionDate:'2026-10-12'});
 const goal={id:'goal',name:'Laptop',accountId:'save',targetAmount:50000,createdAt:record().createdAt,updatedAt:record().updatedAt};
 assert.deepEqual(moneyInsights([cash,saving],[future],[],[goal],now),[]);
});

test('account feedback identifies excluded funds, archived money and the largest holding without advice to spend',()=>{
 const accounts=[{...cash,openingBalance:0},{...saving,openingBalance:600000},{...cash,id:'old',name:'Old bank',openingBalance:200000,includedInAvailable:false,archived:true}];
 const result=accountInsights(accounts,[],[],now);
 assert.match(result.insights[0],/excluded from Available Money.*Edit account/);
 assert.ok(result.insights.some(text=>/Old bank is archived.*2,000.*Total Money/.test(text)));
 assert.ok(result.insights.some(text=>/Savings holds.*6,000.*8,000/.test(text)));
 assert.ok(result.insights.every(text=>!/too much|go spend|afford|get a job/.test(text)));
});
