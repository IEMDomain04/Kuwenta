const {test}=require('node:test');
const assert=require('node:assert/strict');
const {insightPresentation}=require('../../.expo/finance-tests/reporting/insight-presentation.js');
test('insight headlines match the recorded situation without inventing new amounts',()=>{
 for(const [message,title] of [
  ['You spent ?300 more so far this month than by the same date last month.','Spending increased this month'],
  ['You spent ?300 less so far this month than by the same date last month.','Spending decreased this month'],
  ['People still owe you ?500.','Money owed to you'],
  ['?100 moved from Bank to Cash this month.','Money moved between your accounts'],
  ['Your laptop goal reached its ?1000 target.','You reached a savings goal'],
  ['You paid ?40 in cash-out fees this month.','Your cash-in and cash-out fees']
 ])assert.equal(insightPresentation(message).title,title);
});
