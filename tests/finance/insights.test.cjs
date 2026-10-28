const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moneyInsights, accountInsights, moneyInsightReaction } = require('../../.expo/finance-tests/insights.js');
const { cash, record } = require('./fixtures.cjs');
const now = new Date('2026-10-11T02:00:00Z');
const budget = limitAmount => [{ month: '2026-10', category: 'Food', limitAmount }];
const noActivity = ['Record your income or expenses to see your money activity.'];
const noBalances = ['Add your starting balances and transactions to see your money activity.'];
const saving = { ...cash, id: 'save', name: 'Savings', openingBalance: 0, purpose: 'savings', includedInAvailable: false };

test('empty activity avoids spending feedback and shows a concise available-money summary', () => {
  assert.deepEqual(moneyInsights([cash], [], [], [], now), noActivity);
  const result = accountInsights([cash], [], [], now);
  assert.equal(result.totalMoney, 100000);
  assert.equal(result.availableMoney, 100000);
  assert.equal(result.insights.length, 1);
  assert.match(result.insights[0], /available for spending/);
});
test('budget warnings precede observations and use the current month only', () => {
  const rows = [record(), record({ id: 'older', amount: 9000, transactionDate: '2026-09-09' })];
  const result = moneyInsights([cash], rows, budget(15000), [], now);
  assert.match(result[0], /spent.*120.*150.*30 remains/);
  assert.ok(result.some(text => /120 of your/.test(text) && text.includes('this month')));
  assert.ok(result.every(text => !/expenses exceed income/.test(text)));
  assert.equal(moneyInsightReaction(result[0]), 'thinking');
});
test('limit reached and overspending take priority over successful income', () => {
  const rows = [record({ amount: 15000 }), record({ id: 'income', type: 'INCOME', category: 'Freelance', amount: 200000 })];
  assert.match(moneyInsights([cash], rows, budget(15000), [], now)[0], /used your.*150.*budget/);
  assert.match(moneyInsights([cash], [record({ amount: 16000 }), rows[1]], budget(15000), [], now)[0], /10 more than your Food budget/);
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
  assert.match(result[0], /goal has.*500.*1,000.*500 remains/);
  assert.match(result[1], /500 moved into savings/);
  assert.ok(result.every(text => !text.includes('expense category')));
  assert.ok(moneyInsights([cash, saving], [transfer], [], [{ ...goal, targetAmount: 50000 }], now).some(text => /goal reached its.*target/.test(text)));
});
test('editing and deleting records recalculates insights without mutation', () => {
  const rows = Object.freeze([Object.freeze(record({ amount: 16000 }))]);
  assert.match(moneyInsights([cash], rows, budget(15000), [], now)[0], /more than your Food budget/);
  assert.ok(!moneyInsights([cash], [record({ amount: 1000 })], budget(15000), [], now).some(text => text.includes('more than your')));
  assert.deepEqual(moneyInsights([cash], [], budget(15000), [], now), noActivity);
  assert.equal(rows[0].amount, 16000);
});
test('spending comparisons use matched dates and omit unavailable comparisons', () => {
  const rows = [record({ amount: 12000 }), record({ id: 'previous', amount: 10000, transactionDate: '2026-09-09' }), record({ id: 'later', amount: 900000, transactionDate: '2026-09-20' })];
  assert.ok(moneyInsights([cash], rows, [], [], now).some(text => /20 more/.test(text) && /October 1-11, 2026.*September 1-11, 2026/.test(text)));
  assert.ok(!moneyInsights([cash], [rows[0]], [], [], now).some(text => /compared/.test(text)));
  const end = new Date('2026-03-31T02:00:00Z');
  const matched = [record({ amount: 12000, transactionDate: '2026-03-27' }), record({ id: 'prior', amount: 10000, transactionDate: '2026-02-27' }), record({ id: 'unmatched', amount: 90000, transactionDate: '2026-03-31' })];
  assert.ok(moneyInsights([cash], matched, [], [], end).some(text => /20 more/.test(text) && /March 1-28, 2026.*February 1-28, 2026/.test(text)));
});
test('remaining budget allowances sum positive category balances, not overspending offsets', () => {
  const rows = [record({ amount: 16000 })];
  const budgets = [...budget(10000), { month: '2026-10', category: 'Transportation', limitAmount: 90000 }];
  const result = moneyInsights([cash], rows, budgets, [], now);
  assert.ok(result.some(text => /900 remaining.*840 available/.test(text)));
  const funded = moneyInsights([cash], [record()], budget(15000), [], now);
  assert.ok(funded.some(text => /30 remains/.test(text)));
  assert.ok(funded.every(text => !text.includes("Budgets don't set money aside")));
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
  assert.ok(result.insights.some(text => /Old wallet is archived.*200.*remains in your total/.test(text)));
  assert.ok(result.insights.some(text => /400 is in savings accounts.*available for spending/.test(text)));
});
test('negative balances are the first account insight and savings concentration gets useful feedback', () => {
  const accounts = [{ ...cash, openingBalance: -10000 }, { ...saving, openingBalance: 100000 }];
  const result = accountInsights(accounts, [], [], now);
  assert.match(result.insights[0], /Cash shows -.*100/);
  assert.ok(result.insights.some(text => /in savings accounts.*available for spending/.test(text)));
  const concentrated = accountInsights([{ ...cash, openingBalance: 5000 }, { ...saving, openingBalance: 100000 }], [], [], now);
  assert.ok(concentrated.insights.some(text => /in savings accounts.*50.*available/.test(text)));
});
test('account spending feedback names the account and excludes past or future activity', () => {
  const result = accountInsights([cash], [record({ amount: 30000 })], [], now);
  assert.ok(result.insights.some(text => /spent.*300 from Cash this month/.test(text)));
  assert.ok(accountInsights([cash], [record({ amount: 20000 })], [], now).insights.some(text => /spent.*200 from Cash/.test(text)));
  for(const date of ['2026-08-01','2026-10-12']) assert.ok(accountInsights([cash], [record({transactionDate:date})], [], now).insights.every(text => !/You spent .* from /.test(text)));
});

test('transfers explain account movement without calling the principal spending', () => {
  const transfer = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 30000 });
  const result = accountInsights([cash, saving], [transfer], [], now);
  assert.equal(result.totalMoney, cash.openingBalance);
  assert.match(result.insights[0], /300 moved from Cash to Savings.*stayed within your accounts/);
  assert.ok(result.insights.every(text => !/You spent|fell by/.test(text)));
});

test('tied categories are identified honestly and future expenses do not trigger warnings', () => {
  const income = category => record({ id: category, type: 'INCOME', category, amount: 50000 });
  assert.ok(moneyInsights([cash], [income('Salary'), income('Freelance')], [], [], now).some(text => /tied for your largest income source/.test(text)));
  assert.deepEqual(moneyInsights([cash], [record({ transactionDate: '2026-10-12' })], budget(1000), [], now), noActivity);
});


test('account feedback includes savings and actual spending while preserving centavos', () => {
  const result = accountInsights([cash, { ...saving, openingBalance: 200050 }], [record({ amount: 12025 })], [], now);
  assert.match(result.insights[0], /spent.*120.25 from Cash/);
  assert.ok(result.insights.some(text => /2,000.50 is in savings accounts.*879.75 is available/.test(text)));
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
  assert.ok(result.insights.some(text => /spent.*100.50 from Cash this month/.test(text)));
  assert.equal(result.availableMoney,89950);
  assert.ok(result.insights.every(text => !/spent.*110.50 from|spent.*150.50 from/.test(text)));
  const empty = accountInsights([{ ...cash, openingBalance: 0 }], [], [], now);
  assert.deepEqual(empty.insights, noBalances);
});


test('ordinary student spending with no income gets factual, friendly feedback', () => {
 const rows = Object.freeze([
  Object.freeze(record({ category: 'Meals', amount: 12000 })),
  Object.freeze(record({ id: 'fare', category: 'Transport', amount: 3000 })),
 ]);
 const before = JSON.stringify(rows);
 const messages = moneyInsights([cash], rows, [], [], now);
 assert.ok(messages.some(text => /Meals made up.*120 of your.*150/.test(text)));
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
 assert.match(negative, /Cash shows -/);
 assert.equal(moneyInsightReaction(negative), 'concerned');
 const gap = first([{ ...cash, openingBalance: 15000 }], [record()], budget(20000));
 assert.match(gap, /remaining, but/);
 assert.equal(moneyInsightReaction(gap), 'concerned');
 const future = moneyInsights([{ ...cash, openingBalance: 0 }], [record({ transactionDate: '2026-10-12' })], [], [], now);
 assert.deepEqual(future, noBalances);
});

test('within-budget spending, saving and goals produce supportive expressions', () => {
 const within = moneyInsights([cash], [record()], budget(30000), [], now)[0];
 assert.match(within, /180 left for Food this month/);
 assert.equal(moneyInsightReaction(within), 'friendly');
 const into = record({ type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 10000, sourcePurpose: 'spending', destinationPurpose: 'savings' });
 const goal = { id: 'goal', name: 'Laptop', accountId: 'save', targetAmount: 10000, createdAt: into.createdAt, updatedAt: into.updatedAt };
 const messages = moneyInsights([cash, saving], [into], [], [goal], now);
 assert.equal(moneyInsightReaction(messages[0]), 'celebrating');
 assert.equal(moneyInsightReaction(messages.find(text => /moved into savings/.test(text))), 'encouraging');
 const funded = moneyInsights([cash, saving], [into], [], [{ ...goal, targetAmount: 20000 }], now);
 assert.equal(moneyInsightReaction(funded.find(text => /goal has.*100.*200/.test(text))), 'encouraging');
});

test('higher spending and savings withdrawals are observations, not sad reactions', () => {
 const rows = [record(), record({ id: 'prior', amount: 10000, transactionDate: '2026-09-09' })];
 const higher = moneyInsights([cash], rows, [], [], now).find(text => /more during/.test(text));
 assert.ok(higher);
 assert.equal(moneyInsightReaction(higher), 'thinking');
 const out = record({ type: 'TRANSFER', category: 'Transfer', accountId: 'save', destinationAccountId: 'cash', amount: 10000, sourcePurpose: 'savings', destinationPurpose: 'spending' });
 const withdrawal = moneyInsights([cash, { ...saving, openingBalance: 20000 }], [out], [], [], now)[0];
 assert.match(withdrawal, /moved out of savings/);
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
 assert.ok(messages.some(text=>/People still owe you.*450.*Record repayments/.test(text)));
 assert.ok(messages.some(text=>/300 left to repay/.test(text)));
 assert.ok(messages.every(text=>!/expense category|largest income source/.test(text)));
 assert.equal(JSON.stringify(context),before);
 const result=accountInsights([cash],movements,[],now,context);
 assert.match(result.insights[0],/lent.*650.*received.*200 back.*450 is still owed/);
 assert.equal(result.totalMoney,55000);
});

test('tracking-only debts explain what remains owed without inventing lending or repayments',()=>{
 const context={debts:[debtEntry({existing:true,accountId:undefined})],payments:[],additions:[{...addedEntry,existing:true,accountId:undefined}]};
 const home=moneyInsights([cash],[],[],[],now,context);
 assert.ok(home.some(text=>/People still owe you.*650/.test(text)));
 const account=accountInsights([cash],[],[],now,context);
 assert.equal(account.totalMoney,cash.openingBalance);assert.ok(account.insights.every(text=>!text.includes('You lent')));
 const settled={...context,payments:[{...paymentEntry,amount:65000}]};
 assert.ok(moneyInsights([cash],[],[],[],now,settled).every(text=>!/still owe/.test(text)));
 const future={debts:[debtEntry({transactionDate:'2026-10-12'})],payments:[],additions:[]};
 assert.deepEqual(moneyInsights([cash],[],[],[],now,future),noActivity);
});

test('cash-in/out fee insights exclude exchanged principal, service losses and ordinary Fees entries',()=>{
 const {exchangeDraft,exchangeRecords}=require('../../.expo/finance-tests/exchanges.js');
 const exchange=(id,kind,paid,received)=>exchangeRecords(id,exchangeDraft('cash',{kind,paid,received,receivedAccountId:'save',extraAccountId:'cash',earningsConfirmed:true},'2026-10-09','10:00:00'),record().createdAt);
 const rows=[...exchange('in','E-bank Cash-in',20400,20000),...exchange('out','E-bank Cash-out',10000,9800),...exchange('service','Service sale',1000,900),record({id:'other-fee',category:'Fees',amount:500})];
 const result=accountInsights([cash,saving],rows,[],now);
 assert.ok(result.insights.some(text=>/paid.*6 in cash-in\/out fees this month/.test(text)));
 assert.equal(result.totalMoney,98800);
 const equal=accountInsights([cash,saving],exchange('equal','E-bank Cash-in',10000,10000),[],now);
 assert.ok(equal.insights.every(text=>!/paid.*fees this month/.test(text)));
});

test('Home and Accounts keep one main insight plus at most four others with warnings first',()=>{
 const accounts=[{...cash,openingBalance:-1000},{...saving,openingBalance:200000},{...cash,id:'old',name:'Old account',openingBalance:50000,archived:true}];
 const rows=[record({category:'Meals'}),record({id:'fare',category:'Transport',amount:5000}),record({id:'income',type:'INCOME',category:'Freelance',amount:1000})];
 const budgets=[{month:'2026-10',category:'Meals',limitAmount:10000},{month:'2026-10',category:'Transport',limitAmount:5000}];
 const home=moneyInsights(accounts,rows,budgets,[],now), account=accountInsights(accounts,rows,budgets,now);
 for(const messages of [home,account.insights]){assert.ok(messages.length<=5);assert.equal(new Set(messages).size,messages.length);assert.match(messages[0],/shows -/);}
});

test('overlapping daily weekly and overall budgets stay separate, with exceeded limits before near limits',()=>{
 const budgets=[{month:'daily:2026-10-11',category:'Meals',limitAmount:12500},{month:'weekly:2026-10-05',category:'Meals',limitAmount:10000},{month:'2026-10',category:'Overall spending',limitAmount:50000},{month:'2026-10',category:'Transport',limitAmount:90000}];
 const rows=[record({category:'Meals',transactionDate:'2026-10-11'})];
 const result=moneyInsights([cash],rows,budgets,[],now);
 assert.match(result[0],/20 more than your Meals budget/);
 assert.ok(result.some(text=>/120.*125.*5 remains/.test(text)));
 // Overall remaining is 380, not the sum of the overlapping category/scope limits.
 assert.ok(!result.some(text=>/remaining, but/.test(text)));
});

test('student feedback is neutral and future goals do not trigger a premature celebration',()=>{
 const home=moneyInsights([cash],[record({amount:60000})],[],[],now);
 assert.ok(home.some(text=>/600 in spending.*money you already had/.test(text)));
 assert.equal(moneyInsightReaction(home[0]),'friendly');
 const future=record({id:'future-goal',type:'TRANSFER',category:'Transfer',destinationAccountId:'save',amount:50000,transactionDate:'2026-10-12'});
 const goal={id:'goal',name:'Laptop',accountId:'save',targetAmount:50000,createdAt:record().createdAt,updatedAt:record().updatedAt};
 assert.deepEqual(moneyInsights([cash,saving],[future],[],[goal],now),noActivity);
});

test('account feedback identifies excluded funds, archived money and the largest holding without advice to spend',()=>{
 const accounts=[{...cash,openingBalance:0},{...saving,openingBalance:600000},{...cash,id:'old',name:'Old bank',openingBalance:200000,includedInAvailable:false,archived:true}];
 const result=accountInsights(accounts,[],[],now);
 assert.match(result.insights[0],/excluded from Available Money.*Edit account/);
 assert.ok(result.insights.some(text=>/Old bank is archived.*2,000.*remains in your total/.test(text)));
 assert.ok(result.insights.some(text=>/Savings holds.*6,000.*8,000/.test(text)));
 assert.ok(result.insights.every(text=>!/too much|go spend|afford|get a job/.test(text)));
});


test('clear budget wording covers daily weekly monthly and overall limits without adding their limits together',()=>{
 const rows=[record({category:'Meals',amount:70000,transactionDate:'2026-10-11'})];
 const overall=[{month:'2026-10',category:'Overall spending',limitAmount:100000},{month:'2026-10',category:'Meals',limitAmount:200000}];
 const messages=moneyInsights([cash],rows,overall,[],now);
 assert.ok(messages.some(text=>/spent.*700.*1,000 spending limit this month/.test(text)));
 assert.ok(!messages.some(text=>text.includes("Budgets don't set money aside")));
 const daily=moneyInsights([cash],[record({amount:3000,category:'Meals',transactionDate:'2026-10-11'})],[{month:'daily:2026-10-11',category:'Meals',limitAmount:15000}],[],now);
 assert.match(daily[0],/120 left for Meals today/);
 const weekly=moneyInsights([cash],[record({amount:3000,category:'Meals'})],[{month:'weekly:2026-10-05',category:'Meals',limitAmount:15000}],[],now);
 assert.match(weekly[0],/120 left for Meals this week/);
});

test('savings feedback shows both directions rather than only their net difference',()=>{
 const into=record({id:'into',type:'TRANSFER',category:'Transfer',destinationAccountId:'save',amount:50000,sourcePurpose:'spending',destinationPurpose:'savings'});
 const out=record({id:'out',type:'TRANSFER',category:'Transfer',accountId:'save',destinationAccountId:'cash',amount:20000,sourcePurpose:'savings',destinationPurpose:'spending'});
 const result=moneyInsights([cash,saving],[into,out],[],[],now);
 assert.match(result[0],/500 moved into savings and.*200 moved out this month/);
 assert.ok(result.every(text=>!text.includes('net')));assert.equal(moneyInsightReaction(result[0]),'thinking');
});

test('account insights explain borrowed money and repayments without counting either as income or spending',()=>{
 const {debtMovement}=require('../../.expo/finance-tests/debts.js');
 const debt=debtEntry({kind:'owe'}), context={debts:[debt],payments:[paymentEntry],additions:[]};
 const movements=[debtMovement(debt),debtMovement(debt,paymentEntry)];
 const result=accountInsights([cash],movements,[],now,context);
 assert.match(result.insights[0],/received.*500 in borrowed money and repaid.*200 this month.*300 remains to repay/);
 assert.equal(result.totalMoney,130000);assert.ok(result.insights.every(text=>!/^You spent|income source/.test(text)));
});

test('balance adjustment feedback explains the account correction rather than inventing income or spending',()=>{
 for(const direction of ['increase','decrease']) {
  const result=accountInsights([cash],[record({type:'ADJUSTMENT',category:'Balance adjustment',adjustmentDirection:direction,amount:10000})],[],now);
  assert.match(result.insights[0],/balance adjustment.*Cash by.*100 this month/);
  assert.ok(result.insights[0].includes(direction==='increase'?'not income':'not spending'));
  assert.equal(result.totalMoney,direction==='increase'?110000:90000);
 }
 const cancelling=[record({id:'up',type:'ADJUSTMENT',category:'Balance adjustment',adjustmentDirection:'increase'}),record({id:'down',type:'ADJUSTMENT',category:'Balance adjustment',adjustmentDirection:'decrease'})];
 assert.ok(accountInsights([cash],cancelling,[],now).insights.every(text=>!text.includes('balance adjustment')));
});

test('exchange feedback separates fees and earnings from the transferred amount and total-money changes',()=>{
 const {exchangeDraft,exchangeRecords}=require('../../.expo/finance-tests/exchanges.js');
 const exchange=(kind,paid,received)=>exchangeRecords('exchange',exchangeDraft('cash',{kind,paid,received,receivedAccountId:'save',extraAccountId:'cash',earningsConfirmed:true},'2026-10-09','10:00:00'),record().createdAt);
 const fee=accountInsights([cash,saving],exchange('E-bank Cash-out',10000,9800),[],now);
 const transfer=fee.insights.find(text=>text.includes('moved from Cash to Savings'));
 assert.match(transfer,/98 moved from.*2 in fees reduced your total/);
 assert.ok(!transfer.includes('stayed the same'));assert.equal(fee.totalMoney,99800);
 assert.ok(fee.insights.some(text=>/paid.*2 in cash-out fees/.test(text)));
 const earn=accountInsights([cash,saving],exchange('Service sale',9500,10000),[],now);
 assert.ok(earn.insights.some(text=>/5 in service-exchange earnings/.test(text)));
 assert.ok(earn.insights.some(text=>/95 moved from.*5 in earnings increased your total/.test(text)));
 assert.equal(earn.totalMoney,100500);
});

test('retired income labels combine with their current label in insights without modifying saved records',()=>{
 const rows=Object.freeze([Object.freeze(record({id:'old',type:'INCOME',category:'Gift',amount:20000})),Object.freeze(record({id:'new',type:'INCOME',category:'Gifts',amount:30000})),Object.freeze(record({id:'salary',type:'INCOME',category:'Salary',amount:40000}))]);
 const before=JSON.stringify(rows), messages=moneyInsights([cash],rows,[],[],now);
 assert.ok(messages.some(text=>/Gifts brought in.*500 this month.*largest income source/.test(text)));assert.equal(JSON.stringify(rows),before);
 const others=[record({id:'other-old',type:'INCOME',category:'Other',amount:20000}),record({id:'other-new',type:'INCOME',category:'Other Income',amount:30000})];
 assert.ok(moneyInsights([cash],others,[],[],now).some(text=>/Other Income brought in.*500/.test(text)));
});
