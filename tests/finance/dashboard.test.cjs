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
