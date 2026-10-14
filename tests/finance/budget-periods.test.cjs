const {test}=require('node:test');
const assert=require('node:assert/strict');
const {budgetPeriodKey,budgetPeriodRange}=require('../../.expo/finance-tests/budget-periods.js');
const {budgetReport}=require('../../.expo/finance-tests/budgets.js');
const {budgetAlertPlan}=require('../../.expo/finance-tests/notification-plan.js');
const {serializeBackup,parseBackup}=require('../../.expo/finance-tests/backup.js');
const {createExcelBackup,parseExcelBackup}=require('../../.expo/finance-tests/excel-backup.js');
const {cash,record}=require('./fixtures.cjs');
test('weekly boundaries span months and years; invalid and non-Monday periods are rejected',()=>{
 assert.equal(budgetPeriodKey('weekly','2026-11-01'),'weekly:2026-10-26');
 assert.deepEqual(budgetPeriodRange('weekly:2026-12-28'),{period:'weekly',start:'2026-12-28',end:'2027-01-03'});
 assert.equal(budgetPeriodRange('2028-02').end,'2028-02-29');
 for(const key of ['weekly:2026-10-13','daily:2026-02-30','daily:2026-10-13:extra','daily:2026-10-13:','daily:2026-10-13::extra','2026-13','weekly:9999-12-27'])assert.throws(()=>budgetPeriodRange(key));
});
test('overlapping daily weekly and monthly budgets keep separate expense totals',()=>{
 const budgets=['daily:2026-11-01','weekly:2026-10-26','2026-11'].map(month=>({month,category:'Meals',limitAmount:10000}));
 const rows=[record({id:'before',category:'Meals',transactionDate:'2026-10-25',amount:100}),record({id:'monday',category:'Meals',transactionDate:'2026-10-26',amount:200}),record({id:'sunday',category:'Meals',transactionDate:'2026-11-01',amount:300}),record({id:'after',category:'Meals',transactionDate:'2026-11-02',amount:400}),record({type:'INCOME',category:'Salary',transactionDate:'2026-11-01',amount:500}),record({type:'TRANSFER',category:'Transfer',destinationAccountId:'bank',transactionDate:'2026-11-01',amount:500})];
 assert.equal(budgetReport(budgets,rows,budgets[0].month).budgetedSpent,300);
 assert.equal(budgetReport(budgets,rows,budgets[1].month).budgetedSpent,500);
 assert.equal(budgetReport(budgets,rows,budgets[2].month).budgetedSpent,700);
 assert.equal(budgetReport(budgets,rows,budgets[0].month).totalLimit,10000);
});
test('all icon choices and period budgets survive JSON and Excel and old workbooks still import',()=>{
 const icons=['wallet','bank','maya','gcash','gotyme','maribank','uniondigital'];
 const accounts=[cash,...icons.map(icon=>({...cash,id:icon,name:icon,icon}))];
 const budgets=['daily:2026-10-13','weekly:2026-10-12','2026-10'].map(month=>({month,category:'Meals',limitAmount:10000}));
 const backup=parseBackup(serializeBackup(accounts,[],undefined,[],budgets));
 assert.equal(backup.version,9);
 assert.deepEqual(parseExcelBackup(createExcelBackup(backup)),backup);
 assert.throws(()=>parseBackup(JSON.stringify({...backup,version:8})));
 const XLSX=require('xlsx');
 const legacy=parseBackup(serializeBackup(cash,[],undefined,[],[budgets[2]]));
 const wb=XLSX.read(createExcelBackup(legacy),{type:'array'});
 for(const [name,headers] of [['Transactions',['Exchange details','Linked exchange ID']],['Accounts',['Account icon']],['Budgets',['Period','Start date','End date']]]){
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1});const keep=rows[0].map((h,i)=>headers.includes(h)?-1:i).filter(i=>i>=0);
  wb.Sheets[name]=XLSX.utils.aoa_to_sheet(rows.map(row=>keep.map(i=>row[i]??null)));
 }
 wb.Sheets.Kuwenta.B3.v=1;
 assert.deepEqual(parseExcelBackup(new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'}))),legacy);
});
test('budget alerts include only current scopes with distinct category identities',()=>{
 const scopes=['daily:2026-10-13','daily:2026-10-12','weekly:2026-10-12','weekly:2026-10-05','2026-10'];
 const budgets=scopes.map(month=>({month,category:'Meals',limitAmount:10000}));
 const alerts=budgetAlertPlan(budgets,[record({category:'Meals',transactionDate:'2026-10-13',amount:9000})],'2026-10','2026-10-13');
 assert.deepEqual(alerts.map(row=>row.key).sort(),['2026-10:Meals','daily:2026-10-13:Meals','weekly:2026-10-12:Meals'].sort());
});


test('All budget groups retain every scope and never combine overlapping allowances',()=>{
 const {budgetGroups}=require('../../.expo/finance-tests/budgets.js');
 const budgets=['daily:2026-10-13','weekly:2026-10-12','2026-10','2026-09'].map(month=>({month,category:'Meals',limitAmount:10000}));
 const groups=budgetGroups(budgets,[record({category:'Meals',amount:5000,transactionDate:'2026-10-13'})]);
 assert.equal(groups.length,4);assert.equal(groups.reduce((sum,g)=>sum+g.rows.length,0),4);
 assert.deepEqual(groups.map(g=>g.period),['daily','weekly','monthly','monthly']);
 assert.deepEqual(groups.map(g=>g.totalLimit),[10000,10000,10000,10000]);
 assert.equal(budgetGroups(budgets,[],'weekly').length,1);
});
