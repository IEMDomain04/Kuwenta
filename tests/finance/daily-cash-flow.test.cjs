const {test}=require('node:test');
const assert=require('node:assert/strict');
const {record}=require('./fixtures.cjs');
const {dailyCashFlow}=require('../../.expo/finance-tests/reporting/daily-cash-flow.js');
test('daily summary includes zero days and excludes transfers and out of range activity',()=>{
 const result=dailyCashFlow([record({type:'INCOME',amount:100,transactionDate:'2026-10-11'}),record({id:'spent',amount:300,transactionDate:'2026-10-11'}),record({id:'transfer',type:'TRANSFER',amount:999}),record({id:'outside',type:'INCOME',transactionDate:'2026-10-12',amount:500})],'2026-10-10','2026-10-11');
 assert.equal(result.length,2);assert.deepEqual(result[0],{date:'2026-10-10',income:0,expenses:0});assert.deepEqual(result[1],{date:'2026-10-11',income:100,expenses:300});
 assert.equal(dailyCashFlow([],'9999-12-31','9999-12-31').length,1);
 assert.throws(()=>dailyCashFlow([record({type:'INCOME',amount:Number.MAX_SAFE_INTEGER}),record({id:'overflow',type:'INCOME',amount:1})],'2026-10-01','2026-10-31'));
});
