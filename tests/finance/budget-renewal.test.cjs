const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { budgetRenewals, budgetPredecessorToStop } = require('../../.expo/finance-tests/budget-renewal.js');
const { budgetPeriodKey } = require('../../.expo/finance-tests/budget-periods.js');
const { budgetReport, budgetGroups } = require('../../.expo/finance-tests/budgets.js');
const { philippineDateTime } = require('../../.expo/finance-tests/dates.js');
const { initializeDatabase } = require('../../.expo/finance-tests/storage/database.js');
const { renewBudgets, listBudgets, saveBudget, deleteBudget, saveBudgetOrder } = require('../../.expo/finance-tests/storage/budgets.js');
const { readBackupJson, restoreBackup } = require('../../.expo/finance-tests/storage/backup.js');
const { listTransactions, createTransaction } = require('../../.expo/finance-tests/storage/transactions.js');
const { listAccounts } = require('../../.expo/finance-tests/storage/accounts.js');
const { calculateCurrentMoney } = require('../../.expo/finance-tests/calculations.js');
const { parseBackup, serializeBackup } = require('../../.expo/finance-tests/backup.js');
const { createExcelBackup, parseExcelBackup } = require('../../.expo/finance-tests/excel-backup.js');
const { budgetAlertPlan } = require('../../.expo/finance-tests/notification-plan.js');
const { cash, record } = require('./fixtures.cjs');
const daily = (date, category='Meals', limitAmount=15000) => ({ month: 'daily:' + date, category, limitAmount });
const shift = (date, days) => { const value = new Date(date + 'T00:00:00Z'); value.setUTCDate(value.getUTCDate()+days); return value.toISOString().slice(0,10); };
function connect(t) {
 const native = new DatabaseSync(':memory:'); t.after(() => native.close());
 const db = {
  execAsync: async sql => { native.exec(sql); },
  getFirstAsync: async (sql,...params) => native.prepare(sql).get(...params) ?? null,
  getAllAsync: async (sql,...params) => native.prepare(sql).all(...params),
  runAsync: async (sql,...params) => { const result=native.prepare(sql).run(...params);return {changes:Number(result.changes)}; },
  withExclusiveTransactionAsync: async task => { native.exec('BEGIN');try { await task(db);native.exec('COMMIT'); }catch(error){native.exec('ROLLBACK');throw error;} },
 }; return db;
}
async function setup(t) { const db=connect(t);await initializeDatabase(db);return db; }
async function insert(db,budget) { await db.runAsync('INSERT INTO budgets(month,category,limitAmount,repeat) VALUES (?,?,?,?)',budget.month,budget.category,budget.limitAmount,budget.repeat===undefined?null:Number(budget.repeat)); }

test('daily budgets renew at Philippine midnight, independently from weekly/monthly limits',()=>{
 const rows=[daily('2026-10-30'),{month:'weekly:2026-10-26',category:'Meals',limitAmount:100000},{month:'2026-10',category:'Meals',limitAmount:500000}];
 const before=philippineDateTime(new Date('2026-10-30T15:59:59Z')).transactionDate;
 const after=philippineDateTime(new Date('2026-10-30T16:00:00Z')).transactionDate;
 assert.equal(budgetRenewals(rows,before).length,0);
 const next=budgetRenewals(rows,after);assert.equal(next.length,1);assert.deepEqual(next[0].budget,daily('2026-10-31'));
 const monday=budgetRenewals(rows,'2026-11-02');assert.deepEqual(monday.map(row=>row.budget.month).sort(),['2026-11','daily:2026-11-02','weekly:2026-11-02']);
});
test('new periods preserve limits, do not carry unused allowance, and retain past spending',()=>{
 const old=daily('2026-10-30'),fresh=budgetRenewals([old],'2026-10-31')[0].budget;
 const expenses=[record({category:'Meals',amount:12000,transactionDate:'2026-10-30'}),record({id:'today',category:'Meals',amount:4000,transactionDate:'2026-10-31'})];
 assert.equal(budgetReport([old,fresh],expenses,old.month).rows[0].remaining,3000);
 assert.equal(budgetReport([old,fresh],expenses,fresh.month).rows[0].remaining,11000);
 assert.equal(fresh.limitAmount,15000);
 assert.equal(budgetGroups([old,fresh],expenses,'all','2026-10-31').length,1);
 assert.equal(budgetGroups([old,fresh],expenses,'all','2026-10-31',true).length,2);
});
test('missing periods are not backfilled, future limits are respected, and year/leap boundaries work',()=>{
 const rows=[daily('2026-01-01')];
 assert.deepEqual(budgetRenewals(rows,'2026-10-31').map(row=>row.budget.month),['daily:2026-10-31']);
 const future=daily('2026-11-02','Meals',25000);
 assert.equal(budgetRenewals([future],'2026-10-31').length,0);
 assert.equal(budgetRenewals([rows[0],future],'2026-11-02').length,0);
 assert.equal(budgetRenewals([rows[0],future],'2026-11-03')[0].budget.limitAmount,25000);
 assert.equal(budgetRenewals([{month:'2026-12',category:'Meals',limitAmount:100}], '2027-01-01')[0].budget.month,'2027-01');
 assert.equal(budgetRenewals([daily('2028-02-28')],'2028-02-29')[0].budget.month,'daily:2028-02-29');
 assert.equal(budgetRenewals([daily('2028-02-29')],'2028-03-01')[0].budget.month,'daily:2028-03-01');
 assert.equal(budgetRenewals([{month:'weekly:2026-12-28',category:'Meals',limitAmount:100}], '2027-01-04')[0].budget.month,'weekly:2027-01-04');
});
test('renewal is idempotent, preserves manual limits and category order, and does not change money',async t=>{
 const db=await setup(t);
 await insert(db,daily('2026-10-30','Meals'));await insert(db,daily('2026-10-30','Drinks',5000));
 await saveBudgetOrder(db,'daily:2026-10-30',['Meals','Drinks']);
 await createTransaction(db,'spent',record({category:'Meals',amount:12000,transactionDate:'2026-10-30'}));
 const records=await listTransactions(db),before=calculateCurrentMoney(await listAccounts(db),records);
 let budgets=await renewBudgets(db,'2026-10-31');assert.equal(budgets.length,4);
 assert.deepEqual(budgets.filter(row=>row.month==='daily:2026-10-31').map(row=>row.category),['Meals','Drinks']);
 assert.equal((await renewBudgets(db,'2026-10-31')).length,4);
 assert.deepEqual(await listTransactions(db),records);assert.deepEqual(calculateCurrentMoney(await listAccounts(db),await listTransactions(db)),before);
 await insert(db,daily('2026-11-01','Meals',25000));
 budgets=await renewBudgets(db,'2026-11-01');assert.equal(budgets.find(row=>row.month==='daily:2026-11-01'&&row.category==='Meals').limitAmount,25000);
});
test('deleting the active budget stops renewal, including after history deletion and JSON/Excel restoration',async t=>{
 const db=await setup(t),today=philippineDateTime().transactionDate, yesterday=shift(today,-1),older=shift(today,-2);
 await insert(db,daily(older));await insert(db,daily(yesterday));await insert(db,daily(today));
 await deleteBudget(db,'daily:'+today,'Meals');
 assert.equal((await listBudgets(db)).find(row=>row.month==='daily:'+yesterday).repeat,false);
 assert.equal((await renewBudgets(db,shift(today,1))).length,2);
 await deleteBudget(db,'daily:'+yesterday,'Meals');
 const backup=parseBackup(await readBackupJson(db));assert.equal(backup.version,15);assert.equal(backup.budgets[0].repeat,false);
 assert.deepEqual(parseExcelBackup(createExcelBackup(backup)),backup);
 const restored=await setup(t);await restoreBackup(restored,parseExcelBackup(createExcelBackup(backup)));
 assert.equal((await renewBudgets(restored,shift(today,1))).length,1);
 await insert(restored,daily(shift(today,1),'Meals',25000));
 assert.equal((await renewBudgets(restored,shift(today,2))).find(row=>row.month==='daily:'+shift(today,2)).limitAmount,25000);
});
test('deleting historical budgets does not stop the newer active budget',async t=>{
 const db=await setup(t),today=philippineDateTime().transactionDate,old=shift(today,-1);
 await insert(db,daily(old));await insert(db,daily(today));await deleteBudget(db,'daily:'+old,'Meals');
 assert.equal((await renewBudgets(db,shift(today,1))).length,2);
 assert.equal(budgetPredecessorToStop([daily(old),daily(today)],daily(old),today),undefined);
});
test('edited active limits renew and historical edits do not overwrite newer limits',async t=>{
 const db=await setup(t),today=philippineDateTime().transactionDate,old=shift(today,-1);
 await insert(db,daily(old));await insert(db,daily(today));
 await saveBudget(db,daily(today,'Meals',20000),false,daily(today));
 await saveBudget(db,daily(old,'Meals',10000),false,daily(old));
 let rows=await renewBudgets(db,shift(today,1));assert.equal(rows.find(row=>row.month==='daily:'+shift(today,1)).limitAmount,20000);
 const previous=budgetPredecessorToStop([daily(old),daily(today)],daily(today),today);assert.equal(previous.month,'daily:'+old);
 assert.equal(rows.find(row=>row.month==='daily:'+old).limitAmount,10000);
});
test('mid-renewal failure rolls back every new period and its preferences',async t=>{
 const db=await setup(t);await insert(db,daily('2026-10-30','Meals'));await insert(db,daily('2026-10-30','Drinks'));
 const before=await listBudgets(db),run=db.runAsync;let writes=0;
 db.runAsync=async(sql,...params)=>{if(sql.startsWith('INSERT OR IGNORE INTO budgets')&&++writes===2)throw new Error('interrupted');return run(sql,...params);};
 await assert.rejects(renewBudgets(db,'2026-10-31'),/interrupted/);assert.deepEqual(await listBudgets(db),before);
 db.runAsync=run;assert.equal((await renewBudgets(db,'2026-10-31')).length,4);
});
test('migration preserves dated budgets, rejects invalid renewal metadata, and rolls back an interrupted schema change',async t=>{
 const db=await setup(t);await insert(db,daily('2026-10-30'));
 await db.execAsync('ALTER TABLE budgets DROP COLUMN repeat; PRAGMA user_version=17;');
 const exec=db.execAsync;db.execAsync=async sql=>{await exec(sql);if(sql.includes('ADD COLUMN repeat'))throw new Error('interrupted migration');};
 await assert.rejects(initializeDatabase(db),/interrupted migration/);
 assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version,17);
 assert.equal((await db.getAllAsync('PRAGMA table_info(budgets)')).some(row=>row.name==='repeat'),false);
 db.execAsync=exec;await initializeDatabase(db);assert.deepEqual(await listBudgets(db),[daily('2026-10-30')]);
 const backup=JSON.parse(serializeBackup(cash,[],undefined,[],[{...daily('2026-10-30'),repeat:false}]));
 backup.budgets[0].repeat='false';assert.throws(()=>parseBackup(JSON.stringify(backup)),/renewal/);
});
test('budget alerts use the renewed period instead of yesterday\'s spending',()=>{
 const old=daily('2026-10-30'),fresh=budgetRenewals([old],'2026-10-31')[0].budget;
 const spent=record({category:'Meals',amount:20000,transactionDate:'2026-10-30'});
 assert.equal(budgetAlertPlan([old,fresh],[spent],'2026-10','2026-10-31').length,0);
 assert.equal(budgetAlertPlan([old,fresh],[{...spent,transactionDate:'2026-10-31'}],'2026-10','2026-10-31').length,1);
});

test('moving the active budget to weekly stops daily renewal and preserves earlier daily amounts',async t=>{
 const db=await setup(t),today=philippineDateTime().transactionDate,old=shift(today,-1);
 await insert(db,daily(old));await insert(db,daily(today));
 const weekly={month:budgetPeriodKey('weekly',today),category:'Meals',limitAmount:50000};
 await saveBudget(db,weekly,false,daily(today));
 const rows=await renewBudgets(db,shift(today,1));
 assert.equal(rows.some(row=>row.month==='daily:'+shift(today,1)),false);
 assert.equal(rows.find(row=>row.month==='daily:'+old).limitAmount,15000);
 assert.equal(rows.find(row=>row.month===weekly.month).limitAmount,50000);
 assert.equal(budgetRenewals(rows,shift(today,8)).some(row=>row.budget.month.startsWith('weekly:')),true);
});
