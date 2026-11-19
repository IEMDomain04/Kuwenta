const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moneyInsights, accountInsights } = require('../../.expo/finance-tests/reporting/insights.js');
const { cash, record } = require('./fixtures.cjs');
const now = new Date('2026-10-11T02:00:00Z');

test('budget details carry exact figures and the daily scope without changing existing messages', () => {
  const details = [];
  const messages = moneyInsights([cash], [record({ transactionDate:'2026-10-11' })], [{month:'daily:2026-10-11',category:'Food',limitAmount:15000}], [], now, undefined, details);
  assert.deepEqual(details.map(item => item.message), messages);
  assert.match(details[0].title, /30 left/);
  assert.deepEqual(details[0].figures.map(row=>row.value), ['Oct 11, 2026', '\u20b1150', '\u20b1120', '\u20b130']);
  assert.deepEqual(details[0].action.params, {scope:'daily:2026-10-11'});
  assert.ok(details.length <= 5);
});

test('comparison detail uses matched dates and routes to the matching month and expenses', () => {
  const details=[];
  moneyInsights([cash], [record({amount:12000}),record({id:'old',amount:10000,transactionDate:'2026-09-09'})], [], [], now, undefined, details);
  const comparison=details.find(item=>item.icon==='trending-up-outline');
  assert.match(comparison.title,/20 more spent/);
  assert.deepEqual(comparison.figures.map(row=>row.label),['October 1-11, 2026','September 1-11, 2026']);
  assert.deepEqual(comparison.action,{label:'Review expenses',pathname:'/(tabs)/transactions',month:'2026-10',params:{type:'EXPENSE'}});
});

test('savings detail keeps both movement directions separate from income and growth', () => {
  const saving={...cash,id:'save',name:'Savings',purpose:'savings',openingBalance:0,includedInAvailable:false};
  const details=[];
  moneyInsights([cash,saving], [record({id:'in',type:'TRANSFER',category:'Transfer',destinationAccountId:'save',amount:50000,sourcePurpose:'spending',destinationPurpose:'savings'}),record({id:'out',accountId:'save',type:'TRANSFER',category:'Transfer',destinationAccountId:'cash',amount:10000,sourcePurpose:'savings',destinationPurpose:'spending'})], [], [], now, undefined, details);
  const savings=details.find(item=>item.icon==='swap-horizontal-outline');
  assert.deepEqual(savings.figures.map(row=>row.value),['\u20b1500','\u20b1100','\u20b1400']);
  assert.match(savings.calculation,/not income or investment growth/);
});

test('account summaries and fallback insights always have explicit detail data', () => {
  for(const accounts of [[cash],[{...cash,openingBalance:0}],[{...cash,openingBalance:-100}]]) {
    const result=accountInsights(accounts,[],[],now);
    assert.deepEqual(result.insightDetails.map(item=>item.message),result.insights);
    for(const detail of result.insightDetails) {
      assert.ok(detail.title && detail.summary && detail.calculation);
      assert.ok(detail.action);
    }
  }
});

test('all outstanding debt insight actions target the Debts section', () => {
 const debt={id:'debt',kind:'owed',name:'Friend',amount:50000,transactionDate:'2026-10-09',transactionTime:'14:35:00',createdAt:record().createdAt,updatedAt:record().updatedAt};
 const details=[];
 moneyInsights([cash],[],[],[],now,{debts:[debt],payments:[],additions:[]},details);
 const owed=details.find(item=>item.icon==='people-outline');
 assert.ok(owed);
 assert.deepEqual(owed.action,{label:'View debts',pathname:'/(tabs)/plans',params:{section:'debts'}});
});
