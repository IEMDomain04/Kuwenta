const {test}=require('node:test');
const assert=require('node:assert/strict');
const {record}=require('./fixtures.cjs');
const {incomeSources}=require('../../.expo/finance-tests/reporting/income-sources.js');
const {readCategoryFavorites}=require('../../.expo/finance-tests/domain/category-favorites.js');
test('income sources normalize retired categories and exclude spending, transfers and dates outside the range',()=>{
 const result=incomeSources([record({type:'INCOME',category:'Gift',amount:100}),record({id:'two',type:'INCOME',category:'Gifts',amount:250}),record({id:'expense',amount:999}),record({id:'transfer',type:'TRANSFER',amount:999}),record({id:'outside',type:'INCOME',transactionDate:'2026-09-30',amount:500})],'2026-10-01','2026-10-31');
 assert.deepEqual(result,{total:350,rows:[{category:'Gifts',amount:350}]});
 assert.throws(()=>incomeSources([record({type:'INCOME',amount:Number.MAX_SAFE_INTEGER}),record({id:'overflow',type:'INCOME',amount:1})],'2026-10-01','2026-10-31'));
});
test('favorites tolerate damaged preferences and retain only valid unique categories for their type',()=>{
 assert.deepEqual(readCategoryFavorites('bad','EXPENSE'),[]);
 assert.deepEqual(readCategoryFavorites('["Meals","Salary","Meals",4]','EXPENSE'),['Meals']);
 assert.deepEqual(readCategoryFavorites('["Salary","Meals"]','INCOME'),['Salary']);
});

test('saved favorites retain up to ten unique current categories',()=>{
 const categories=require('../../.expo/finance-tests/domain/types.js').CATEGORIES.EXPENSE;
 assert.deepEqual(readCategoryFavorites(JSON.stringify(categories.slice(0,11)),'EXPENSE'),categories.slice(0,10));
});
