const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function harness(hidden=false, additions=[]){
 let settled=false;
 const debts=[{id:'a',name:'Anna',kind:'owe',amount:10000},{id:'b',name:'Ben',kind:'owed',amount:20000},{id:'c',name:'Chris',kind:'owed',amount:5000}];
 const jsx=(type,props)=>({type,props});
 const sandbox={exports:{},require(name){
  if(name==='react')return{useState:()=>[settled,update=>{settled=update(settled);} ]};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{View:'View',Pressable:'Pressable'};
  if(name==='expo-router')return{router:{push(){}}};
  if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
  if(name==='@/components/themed-text')return{ThemedText:'Text'};
  if(name==='@/hooks/use-theme')return{useTheme:()=>({})};
  if(name==='@/hooks/amount-visibility')return{useAmountVisibility:()=>({formatAmount:(amount)=>hidden?'hidden':require('../../.expo/finance-tests/money.js').formatMoney(amount)})};
  if(name==='../provider')return{useFinance:()=>({debts,debtAdditions:additions,debtPayments:[{debtId:'c',amount:5000}],busy:false})};
  if(name==='../debts'||name==='../dates')return require('../../.expo/finance-tests/'+name.slice(3)+'.js');
  if(name==='./ui')return{ActionButton:'Button'};
  if(name==='../components/ui')return{FinanceScreen:'Screen',AddTransactionButton:'Add'};
  if(name==='../components/debts-overview')return{DebtsOverview:'Debts'};
  if(name==='../components/savings-overview')return{SavingsOverview:'Savings'};
  if(name==='../components/budget-overview')return{BudgetOverview:'Budgets'};
  throw new Error(name);
 }};
 function load(path){const target={...sandbox,exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,target);return target.exports;}
 const overview=load('src/features/finance/components/debts-overview.tsx');
 return{render:()=>overview.DebtsOverview(),plans:()=>load('src/features/finance/screens/plans-screen.tsx').default()};
}
function nodes(tree){const result=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;result.push(node);walk(node.props.children);}walk(tree);return result;}
test('debts are separated by direction with correct totals and settled records stay hidden until requested',()=>{
 const h=harness();let all=nodes(h.render());
 const owe=all.find(node=>node.props.accessibilityLabel==='I owe debts');
 const owed=all.find(node=>node.props.accessibilityLabel==='Debts owed to me');
 assert.ok(nodes(owe).some(node=>node.props.children==='Anna'));assert.ok(!nodes(owe).some(node=>node.props.children==='Ben'));
 assert.ok(nodes(owed).some(node=>node.props.children==='Ben'));assert.ok(!nodes(owed).some(node=>node.props.children==='Anna'));
 const money=require('../../.expo/finance-tests/money.js').formatMoney;
 assert.ok(nodes(owe).some(node=>node.props.children===money(10000)));assert.ok(nodes(owed).some(node=>node.props.children===money(20000)));
 assert.ok(!all.some(node=>node.props.children==='Chris'));
 all.find(node=>node.props.label==='Show settled debts').props.onPress();
 assert.ok(nodes(h.render()).some(node=>node.props.children==='Chris'));
});
test('Plans keeps debts below Savings and Goals and privacy masks each group total',()=>{
 const h=harness(true);
 assert.deepEqual(Array.from(h.plans().props.children,node=>node.type),['Budgets','Savings','Debts']);
 const all=nodes(h.render());
 assert.ok(all.filter(node=>node.props.children==='hidden').length>=4);
 for(const node of all)if(typeof node.props.children==='string')assert.ok(!node.props.children.includes(String.fromCodePoint(8369)));
});

test('dashboard includes added borrowing and reopens a previously settled debt',()=>{
 const h=harness(false,[{debtId:'c',amount:15000}]);
 const all=nodes(h.render());
 assert.ok(all.some(node=>node.props.children==='Chris'));
 assert.ok(all.some(node=>node.props.children===require('../../.expo/finance-tests/money.js').formatMoney(35000)));
});
