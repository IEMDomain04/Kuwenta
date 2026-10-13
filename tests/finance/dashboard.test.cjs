const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dashboardReport, dashboardGreeting } = require('../../.expo/finance-tests/dashboard.js');
const { record } = require('./fixtures.cjs');

test('day reports use Philippine midnight and exclude other dates, transfers and adjustments', () => {
  const now = new Date('2026-10-10T16:01:00Z');
  const records = [record({transactionDate:'2026-10-11', amount:12000}), record({transactionDate:'2026-10-11',type:'INCOME',amount:50000,accountId:'bank'}), record(), record({transactionDate:'2026-10-11',type:'TRANSFER'}), record({transactionDate:'2026-10-11',type:'ADJUSTMENT'})];
  const report = dashboardReport(records, 'day', '2026-09', now);
  assert.equal(report.start, '2026-10-11');
  assert.equal(report.income, 50000);
  assert.equal(report.expenses, 12000);
  assert.equal(report.expenseIncomeRate,24);
});
test('week starts Monday, crosses months, and excludes future records', () => {
  const report = dashboardReport([record({transactionDate:'2026-09-28',amount:1}),record({transactionDate:'2026-10-01',amount:2}),record({transactionDate:'2026-10-02',amount:4})], 'week','2026-10',new Date('2026-10-01T04:00:00Z'));
  assert.equal(report.start,'2026-09-28');
  assert.equal(report.end,'2026-10-01');
  assert.equal(report.expenses,3);
  assert.equal(report.buckets.length,4);
  assert.equal(report.buckets.reduce((sum,row)=>sum+row.expenses,0),3);
  assert.equal(dashboardReport([], 'week','2026-10',new Date('2026-10-04T04:00:00Z')).buckets.length,7);
});
test('monthly buckets include leap day and sum to exact totals after edits or deletion', () => {
  const rows=[record({transactionDate:'2024-02-29',amount:12001}),record({transactionDate:'2024-03-01',amount:300})];
  const report=dashboardReport(rows,'month','2024-02');
  assert.equal(report.end,'2024-02-29');
  assert.equal(dashboardReport([], 'month', '9999-12').buckets.length, 5);
  assert.equal(report.expenses,12001);
  assert.equal(report.buckets.reduce((sum,row)=>sum+row.expenses,0),12001);
  assert.equal(dashboardReport([{...rows[0],amount:20001}],'month','2024-02').expenses,20001);
  assert.equal(dashboardReport([],'month','2024-02').expenses,0);
  assert.equal(report.expenseIncomeRate,null);
  assert.equal(dashboardReport([record({amount:200}),record({type:'INCOME',amount:100})],'month','2026-10').expenseIncomeRate,200);
});
test('dashboard rejects invalid periods and unsafe monetary sums', () => {
  assert.throws(()=>dashboardReport([],'month','2026-13'));
  assert.throws(()=>dashboardReport([],'year','2026-10'));
  assert.throws(()=>dashboardReport([record({amount:0})],'month','2026-10'));
  assert.throws(()=>dashboardReport([record({amount:Number.MAX_SAFE_INTEGER}),record({amount:1})],'month','2026-10'));
});
test('greeting uses Philippine hours and handles missing names', () => {
  assert.equal(dashboardGreeting(' Emman ',new Date('2026-10-10T11:00:00Z')),'Good evening, Emman!');
  assert.equal(dashboardGreeting('',new Date('2026-10-10T00:00:00Z')),'Good morning!');
  assert.equal(dashboardGreeting('',new Date('2026-10-10T04:00:00Z')),'Good afternoon!');
});

test('daily expense chart uses weekday labels and excludes income and future days in week view', () => {
  const { dashboardSpending } = require('../../.expo/finance-tests/dashboard.js');
  const now=new Date('2026-10-07T04:00:00Z');
  const records=[record({transactionDate:'2026-10-05',amount:101}),record({transactionDate:'2026-10-07',amount:202}),record({transactionDate:'2026-10-08',amount:303}),record({transactionDate:'2026-10-07',type:'INCOME',amount:500})];
  const week=dashboardSpending(records,'week','2026-10',now);
  assert.deepEqual(week.map(row=>row.label),['M','T','W','TH','F','S','Sun']);
  assert.deepEqual(week.map(row=>row.expenses),[101,0,202,0,0,0,0]);
  assert.equal(week[2].isToday,true);
  const crossMonth=dashboardSpending([], 'week', '2026-10', new Date('2026-10-01T04:00:00Z'));
  assert.equal(crossMonth.length,7);
  assert.equal(crossMonth[0].date,'2026-09-28');
  assert.equal(crossMonth[6].date,'2026-10-04');
  const day=dashboardSpending(records,'day','2026-10',now);
  assert.equal(day[0].date,'2026-10-01');
  assert.equal(day[6].date,'2026-10-07');
  const month=dashboardSpending(records,'month','2026-10',now);
  assert.equal(month.length,31);
  assert.equal(month.reduce((sum,row)=>sum+row.expenses,0),606);
  assert.equal(dashboardSpending([],'month','2024-02',now).length,29);
  assert.equal(dashboardSpending([],'month','9999-12',now).length,31);
});

test('recorded weekly balances include starting balances and dated records without counting transfers twice', () => {
  const { weeklyRecordedBalances } = require('../../.expo/finance-tests/dashboard.js');
  const { cash } = require('./fixtures.cjs');
  const bank={...cash,id:'bank',name:'Bank',openingBalance:0,archived:true};
  const records=[record({type:'INCOME',category:'Salary',amount:50000,transactionDate:'2026-10-05'}),record({id:'expense',amount:12000,transactionDate:'2026-10-06'}),record({id:'transfer',type:'TRANSFER',category:'Transfer',destinationAccountId:'bank',amount:10000,transactionDate:'2026-10-06'}),record({id:'adjust',type:'ADJUSTMENT',category:'Balance adjustment',adjustmentDirection:'decrease',amount:1000,transactionDate:'2026-10-07'})];
  const balances=weeklyRecordedBalances([cash,bank],records,new Date('2026-10-07T04:00:00Z'));
  assert.deepEqual(balances.map(row=>row.balance),[150000,138000,137000,null,null,null,null]);
  assert.equal(weeklyRecordedBalances([cash,bank],records.filter(row=>row.id!=='expense'),new Date('2026-10-07T04:00:00Z'))[2].balance,149000);
  assert.equal(weeklyRecordedBalances([cash,bank],records.map(row=>row.id==='expense'?{...row,amount:13000}:row),new Date('2026-10-07T04:00:00Z'))[2].balance,136000);
  assert.equal(weeklyRecordedBalances([{...cash,openingBalance:-100}],[],new Date('2026-10-07T04:00:00Z'))[0].balance,-100);
  assert.throws(()=>weeklyRecordedBalances([cash],[record({accountId:'missing'})]));
});


test('category chart aggregates expenses only within the selected period', () => {
  const { dashboardCategories } = require('../../.expo/finance-tests/dashboard.js');
  const rows = [record({category:'Meals', amount:6000}), record({category:'Meals', amount:12000}), record({category:'Snacks', amount:3000}), record({type:'INCOME', amount:50000}), record({type:'TRANSFER', amount:10000}), record({type:'ADJUSTMENT', amount:1000}), record({transactionDate:'2026-10-11', amount:90000})];
  assert.deepEqual(dashboardCategories(rows, '2026-10-09', '2026-10-09'), {total:21000,rows:[{category:'Meals',amount:18000},{category:'Snacks',amount:3000}]});
  assert.deepEqual(dashboardCategories([], '2026-10-09', '2026-10-09'), {total:0, rows:[]});
  assert.throws(() => dashboardCategories([record({amount:Number.MAX_SAFE_INTEGER}),record({amount:1})], '2026-10-09','2026-10-09'));
});


test('spending activity week browsing totals completed weeks and excludes partial comparisons',()=>{
 const {activityWeek}=require('../../.expo/finance-tests/dashboard.js');
 const now=new Date('2026-11-03T04:00:00Z');
 const records=[record({id:'older',amount:2000,transactionDate:'2026-10-20'}),record({id:'monday',amount:3000,transactionDate:'2026-10-26'}),record({id:'sunday',amount:4000,transactionDate:'2026-11-01'}),record({id:'today',amount:5000,transactionDate:'2026-11-03'}),record({id:'future',amount:6000,transactionDate:'2026-11-05'}),record({id:'income',type:'INCOME',category:'Salary',amount:9000,transactionDate:'2026-11-01'})];
 const current=activityWeek(records,now,0);assert.equal(current.total,5000);assert.equal(current.difference,null);
 const last=activityWeek(records,now,-1);assert.equal(last.start,'2026-10-26');assert.equal(last.end,'2026-11-01');assert.equal(last.total,7000);assert.equal(last.difference,5000);
 assert.equal(last.days.length,7);assert.ok(last.days.every(day=>!day.isToday));
 assert.throws(()=>activityWeek(records,now,1));
 assert.equal(activityWeek([],new Date('1900-01-01T04:00:00Z')).canGoBack,false);
});
