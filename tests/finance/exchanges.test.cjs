const {test}=require('node:test');
const assert=require('node:assert/strict');
const {exchangeDraft,exchangeRecords,validateExchangeLinks}=require('../../.expo/finance-tests/exchanges.js');
const {cash}=require('./fixtures.cjs');
const {calculateFinanceSummary}=require('../../.expo/finance-tests/calculations.js');
const accounts=[{...cash,openingBalance:500000},{...cash,id:'bank',name:'Bank',openingBalance:500000}];
const time='2026-10-13T04:00:00.000Z';
function rows(kind,from,to,paid,received,extra=from,confirmed=false){return exchangeRecords('exchange',exchangeDraft(from,{kind,paid,received,receivedAccountId:to,extraAccountId:extra,earningsConfirmed:confirmed},'2026-10-13','12:00:00'),time);}
test('cash in, cash out, and service sale report only the intended income and expenses',()=>{
 for(const [records,income,expenses] of [[rows('E-bank Cash-in','cash','bank',204000,200000),0,4000],[rows('E-bank Cash-out','bank','cash',100000,98000),0,2000],[rows('Service sale','bank','cash',9500,10000),500,0]]){
  validateExchangeLinks(records);const summary=calculateFinanceSummary(accounts,records,'2026-10');
  assert.equal(summary.monthlyIncome,income);assert.equal(summary.monthlyExpenses,expenses);
 }
 const deducted=rows('E-bank Cash-in','cash','bank',200000,196000,'bank');
 assert.equal(deducted[0].amount,200000);assert.equal(deducted[1].accountId,'bank');
 assert.equal(rows('E-bank Cash-in','cash','bank',10000,10000).length,1);
 assert.throws(()=>rows('E-bank Cash-out','bank','cash',9500,10000,'cash'),/Confirm/);
 assert.equal(rows('E-bank Cash-out','bank','cash',9500,10000,'cash',true)[1].amount,500);
});
test('missing or altered exchange links are rejected before restoration',()=>{
 const records=rows('Service sale','bank','cash',9500,10000);
 assert.throws(()=>validateExchangeLinks(records.slice(0,1)),/Incomplete/);
 assert.throws(()=>validateExchangeLinks(records.slice(1)),/missing/);
 assert.throws(()=>validateExchangeLinks([records[0],{...records[1],amount:11000}]),/do not match/);
});


test('service exchanges support earnings, losses and equal payments without reporting the principal',()=>{
 for(const [paid,received,income,expense] of [[9500,10000,500,0],[10000,9500,0,500],[10000,10000,0,0]]){
  const records=rows('Service sale','bank','cash',paid,received);validateExchangeLinks(records);
  const report=calculateFinanceSummary(accounts,records,'2026-10');assert.equal(report.monthlyIncome,income);assert.equal(report.monthlyExpenses,expense);
  assert.equal(report.balance,500000+received);
  assert.equal(records[0].type,'TRANSFER');assert.equal(records.length,paid===received?1:2);
 }
});

test('old service pairs normalize without changing balances, and transaction grouping and lookup retain parent IDs',()=>{
 const {normalizeServiceExchanges,groupExchangeTransactions,resolveTransactionId}=require('../../.expo/finance-tests/exchanges.js');
 for(const received of [10000,9500]){
  const exchange={kind:'Service sale',paid:9500,received,receivedAccountId:'cash',extraAccountId:'bank',earningsConfirmed:false};
  const draft={type:'EXPENSE',category:'Service sale',amount:9500,accountId:'bank',transactionDate:'2026-10-13',transactionTime:'12:00:00',exchange};
  const old=exchangeRecords('old',draft,time);const updated=normalizeServiceExchanges(old,accounts);
  assert.equal(calculateFinanceSummary(accounts,old,'2026-10').balance,calculateFinanceSummary(accounts,updated,'2026-10').balance);
  assert.equal(resolveTransactionId(updated,'old:extra'),'old');
  assert.equal(groupExchangeTransactions(updated,updated).length,1);
  assert.equal(groupExchangeTransactions(updated,updated)[0].id,'old');
  assert.equal(resolveTransactionId(updated,'missing'),'missing');
 }
});
