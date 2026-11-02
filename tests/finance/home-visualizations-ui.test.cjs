const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source=ts.transpileModule(fs.readFileSync('src/features/finance/components/period-overview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render(visible, transactions = [], now = new Date('2026-11-03T04:00:00Z'), options = {}) {
  let reportCalls=0, activityCalls=0, cursor=0; const hooks=[],navigation=[];
  const jsx=(type,props)=>({type,props});
  const sandbox={exports:{},require(name){
    if(name==='@/hooks/amount-visibility')return{useAmountVisibility:()=>({hidden:!!options.hidden,formatAmount:options.hidden?()=>'hidden':require('../../.expo/finance-tests/money.js').formatMoney,conceal:text=>options.hidden?text.replace(/(?:\u20b1|PHP\s*)[\d,.]+/g,'hidden'):text})};
    if(name==='react')return{useState:initial=>{const index=cursor++;if(!(index in hooks))hooks[index]=initial;return[hooks[index],value=>hooks[index]=typeof value==='function'?value(hooks[index]):value];},useMemo:factory=>factory()};
    if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
    if(name==='react-native')return{View:'View',Pressable:'Button',Modal:'Modal',ScrollView:'ScrollView',useWindowDimensions:()=>({fontScale:options.fontScale??1,width:options.width??390,height:800})};
    if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView'};
    if(name==='expo-router')return{router:{push:value=>navigation.push(value)}};
    if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
    if(name==='@/components/themed-text')return{ThemedText:'Text'};
    if(name==='@/hooks/use-color-scheme')return{useColorScheme:()=> 'light'};
    if(name==='@/hooks/use-theme')return{useTheme:()=>({})};
    if(name==='./account-balances')return{AccountBalances:'Balances'};
    if(name==='./home-month-picker')return{HomeMonthPicker:'MonthPicker'};
    if(name==='./selection-sheet')return{SelectionSheet:'SelectionSheet'};
    if(name==='./dashboard-charts')return{SpendingTrend:'Trend',IncomeExpenseChart:'Comparison'};
    if(name==='./category-spending')return{CategorySpending:'Chart'};
    if(name==='../provider')return{useFinance:()=>({transactions})};
    if(name==='../dashboard')return{activityWeek:(...args)=>{activityCalls++;return require('../../.expo/finance-tests/dashboard.js').activityWeek(...args);},dashboardReport:(...args)=>{reportCalls++;return require('../../.expo/finance-tests/dashboard.js').dashboardReport(...args);},dashboardSpending:(...args)=>{activityCalls++;return require('../../.expo/finance-tests/dashboard.js').dashboardSpending(...args);}};
    if(['../dates','../money','../home-visualizations','../home-reporting'].includes(name))return require('../../.expo/finance-tests/'+name.slice(3)+'.js');
    throw new Error(name);
  }};
  vm.runInNewContext(source,sandbox);
  function snapshot(){cursor=0;
  const tree=sandbox.exports.PeriodOverview({now,visible});
  const nodes=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(tree);
  return{tree,nodes,reportCalls,activityCalls,navigation,rerender:snapshot};
  } return snapshot();
}
test('every visualization combination renders only selected sections and skips hidden calculations',()=>{
  for(let mask=0;mask<64;mask++){
    const visible=['activity','summary','categories','trend','comparison','balances'].filter((_,i)=>mask&(1<<i));
    const h=render(visible);
    assert.equal(h.activityCalls,Number(visible.includes('activity')||visible.includes('trend')));
    assert.equal(h.reportCalls,visible.includes('summary')||visible.includes('categories')||visible.includes('comparison')?1:0);
    assert.equal(h.nodes.some(node=>node.type==='Trend'),visible.includes('trend'));
    assert.equal(h.nodes.some(node=>node.type==='Comparison'),visible.includes('comparison'));
    assert.equal(h.nodes.some(node=>node.type==='Chart'),visible.includes('categories'));
    assert.equal(h.nodes.some(node=>node.type==='Text'&&node.props.children==='THIS WEEK'),visible.includes('activity'));
    assert.equal(h.nodes.filter(node=>node.props.accessibilityLabel?.startsWith('Choose Home reporting period')).length,visible.some(value=>value!=='balances')?1:0);
    assert.ok(!h.nodes.some(node=>['Previous spending week','Next spending week'].includes(node.props.accessibilityLabel)));
    assert.ok(!h.nodes.some(node=>node.type==='Text'&&JSON.stringify(node.props.children).includes('so far')));
    assert.equal(h.nodes.some(node=>node.type==='Text'&&node.props.children==='Income'),visible.includes('summary'));
    assert.equal(h.nodes.filter(node=>node.props.accessibilityLabel==='day report').length,0);
    assert.equal(h.nodes.some(node=>node.type==='Balances'),visible.includes('balances'));
    if(visible.includes('balances') && visible.includes('summary'))assert.ok(h.nodes.findIndex(node=>node.props.children==='Income')<h.nodes.findIndex(node=>node.type==='Balances'));
    if(visible.includes('balances') && visible.includes('categories'))assert.ok(h.nodes.findIndex(node=>node.type==='Balances')<h.nodes.findIndex(node=>node.type==='Chart'));
    if(mask===0)assert.equal(h.tree,null);
  }
});


test('spending tiles toggle details off on a second tap, switch days, and clear on week change',()=>{
 let h=render(['activity']);
 const tiles=()=>h.nodes.filter(node=>node.type==='Button'&&node.props.accessibilityLabel?.endsWith(' spent'));
 const details=()=>h.nodes.filter(node=>node.props.accessibilityLiveRegion==='polite');
 assert.equal(details().length,0);
 tiles()[0].props.onPress();h=h.rerender();assert.equal(tiles()[0].props.accessibilityState.selected,true);assert.equal(details().length,1);
 tiles()[0].props.onPress();h=h.rerender();assert.ok(tiles().every(tile=>!tile.props.accessibilityState.selected));assert.equal(details().length,0);
 tiles()[0].props.onPress();h=h.rerender();tiles()[1].props.onPress();h=h.rerender();
 assert.equal(tiles()[0].props.accessibilityState.selected,false);assert.equal(tiles()[1].props.accessibilityState.selected,true);assert.equal(details().length,1);
 h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-week');h=h.rerender();assert.equal(details().length,0);assert.ok(tiles().every(tile=>!tile.props.accessibilityState.selected));
});


test('one Home period updates every historical visual together across month boundaries',()=>{
 const {record}=require('./fixtures.cjs');
 const transactions=[record({id:'last-mon',transactionDate:'2026-10-26',amount:10000}),record({id:'last-sun',transactionDate:'2026-11-01',amount:20000}),record({id:'income',transactionDate:'2026-10-05',type:'INCOME',amount:50000}),record({id:'today',transactionDate:'2026-11-03',amount:5000}),record({id:'future',transactionDate:'2026-11-05',amount:90000})];
 let h=render(['activity','summary','categories','trend','comparison','balances'],transactions);
 const select=value=>{h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect(value);h=h.rerender();};
 const comparison=()=>h.nodes.find(node=>node.type==='Comparison').props;
 const chart=()=>h.nodes.find(node=>node.type==='Chart').props;
 const trend=()=>h.nodes.find(node=>node.type==='Trend').props;
 assert.equal(comparison().expenses,5000);
 select('last-week');
 assert.equal(comparison().expenses,30000);assert.equal(chart().start,'2026-10-26');assert.equal(chart().end,'2026-11-01');
 assert.equal(trend().days.reduce((sum,day)=>sum+day.expenses,0),30000);assert.equal(trend().label,'Last week');
 assert.equal(h.nodes.filter(node=>node.props.accessibilityLabel?.endsWith(' spent')).length,7);
 select('last-month');
 assert.equal(comparison().expenses,10000);assert.equal(comparison().income,50000);assert.equal(chart().start,'2026-10-01');assert.equal(chart().end,'2026-10-31');
 assert.equal(trend().days.length,31);assert.equal(h.nodes.filter(node=>node.props.testID==='spending-calendar-day').length,31);
 assert.ok(h.nodes.some(node=>node.type==='Balances'));
 select('custom');assert.equal(h.nodes.find(node=>node.type==='MonthPicker').props.open,true);h.nodes.find(node=>node.type==='MonthPicker').props.onOpenChange(false);h=h.rerender();select('custom');assert.equal(h.nodes.find(node=>node.type==='MonthPicker').props.open,true);h.nodes.find(node=>node.type==='MonthPicker').props.onChange('2024-02');h=h.rerender();
 assert.equal(chart().start,'2024-02-01');assert.equal(chart().end,'2024-02-29');assert.equal(trend().days.length,29);assert.equal(comparison().expenses,0);
});


test('monthly cards fit four, five and six calendar weeks into equal compact heights',()=>{
 let h=render(['activity','summary']);
 h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('custom');h=h.rerender();
 for(const [month,count] of [['2021-02',28],['2026-04',30],['2026-08',31],['2024-02',29]]){
  h.nodes.find(node=>node.type==='MonthPicker').props.onChange(month);h=h.rerender();
  const activity=h.nodes.find(node=>node.props.testID==='spending-activity-card');
  const summary=h.nodes.find(node=>node.props.testID==='income-expense-summary-card');
  assert.equal(activity.props.style.height,undefined);assert.equal(summary.props.style.height,undefined);
  assert.ok(h.nodes.some(node=>node.props.style?.flexDirection==='row' && node.props.style?.alignItems==='stretch'));
  assert.equal(activity.props.style.flexGrow,58);assert.equal(summary.props.style.flexGrow,42);
  assert.equal(h.nodes.find(node=>node.props.testID==='spending-calendar').props.style.height,124);
  assert.equal(h.nodes.filter(node=>node.props.testID==='spending-calendar-row').length,6);
  assert.equal(h.nodes.filter(node=>node.props.testID==='spending-calendar-day').length,count);
  assert.ok(h.nodes.findIndex(node=>node.type==='MonthPicker')<h.nodes.findIndex(node=>node.props.accessibilityLabel?.startsWith('Choose Home reporting period')));
 }
 for(const options of [{width:320},{fontScale:2}]){
  let readable=render(['activity','summary'],[],undefined,options);
  readable.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('month');readable=readable.rerender();
  const activity=readable.nodes.find(node=>node.props.testID==='spending-activity-card');
  const summary=readable.nodes.find(node=>node.props.testID==='income-expense-summary-card');
  assert.equal(activity.props.style.flexGrow,0);assert.equal(summary.props.style.height,activity.props.style.height);
 }
});

test('the larger spending sheet expands days, toggles details and opens the correct transaction',()=>{
 const {record}=require('./fixtures.cjs');
 const {readableTransactionDate}=require('../../.expo/finance-tests/dates.js');
 const rows=[record({id:'lunch',notes:'Lunch',amount:12345,transactionDate:'2026-10-01'}),record({id:'income',type:'INCOME',amount:90000,transactionDate:'2026-10-01'})];
 let h=render(['activity','summary'],rows);
 h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-month');h=h.rerender();
 assert.ok(!h.nodes.some(node=>node.type==='Modal'));
 h.nodes.find(node=>node.props.accessibilityLabel==='Open daily spending').props.onPress();h=h.rerender();
 assert.ok(h.nodes.some(node=>node.type==='Modal'));
 const day=()=>h.nodes.find(node=>node.type==='Button'&&node.props.accessibilityLabel?.startsWith(readableTransactionDate('2026-10-01')+', '));
 day().props.onPress();h=h.rerender();assert.equal(day().props.accessibilityState.expanded,true);
 let transaction=h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('View Lunch, '));assert.ok(transaction);
 day().props.onPress();h=h.rerender();assert.ok(!h.nodes.some(node=>node.props.accessibilityLabel?.startsWith('View Lunch, ')));
 day().props.onPress();h=h.rerender();transaction=h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('View Lunch, '));transaction.props.onPress();h=h.rerender();
 assert.equal(h.navigation[0].pathname,'/transaction');assert.equal(h.navigation[0].params.id,'lunch');assert.ok(!h.nodes.some(node=>node.type==='Modal'));
});

test('amount privacy also masks daily spending sheet labels and transaction descriptions',()=>{
 const {record}=require('./fixtures.cjs');
 let h=render(['activity','summary'],[record({transactionDate:'2026-10-01',amount:12345,notes:'Lunch PHP 123.45'})],undefined,{hidden:true});
 h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-month');h=h.rerender();
 h.nodes.find(node=>node.props.accessibilityLabel==='Open daily spending').props.onPress();h=h.rerender();
 h.nodes.find(node=>node.type==='Button'&&node.props.accessibilityLabel?.endsWith('hidden spent')).props.onPress();h=h.rerender();
 const text=JSON.stringify(h.nodes.filter(node=>node.type==='Text').map(node=>node.props.children));
 assert.ok(!text.includes('123.45'));assert.ok(text.includes('Lunch hidden'));
 assert.ok(h.nodes.filter(node=>node.props.accessibilityLabel).every(node=>!node.props.accessibilityLabel.includes('123.45')));
});


test('monthly comparison represents recorded income and expenses, including empty and one-sided data',()=>{
 const {record}=require('./fixtures.cjs');
 for(const [income,expenses,expectedIncome,expectedExpenses] of [[10000,30000,'25%','75%'],[0,0,'0%','0%'],[10000,0,'100%','0%'],[0,10000,'0%','100%']]){
  const rows=[];
  if(income)rows.push(record({id:'income',type:'INCOME',amount:income,transactionDate:'2026-10-01'}));
  if(expenses)rows.push(record({id:'expense',amount:expenses,transactionDate:'2026-10-01'}));
  let h=render(['activity','summary'],rows);
  h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-month');h=h.rerender();
  assert.equal(h.nodes.find(node=>node.props.testID==='income-comparison-segment').props.style.width,expectedIncome);
  assert.equal(h.nodes.find(node=>node.props.testID==='expense-comparison-segment').props.style.width,expectedExpenses);
  const bar=h.nodes.find(node=>node.props.testID==='income-expense-comparison');assert.equal(bar.props.accessibilityRole,'image');assert.match(bar.props.accessibilityLabel,/Recorded income/);
  assert.equal(h.nodes.find(node=>node.props.accessibilityLabel==='Open daily spending').props.style.marginTop,undefined);
  assert.equal(h.nodes.find(node=>node.props.testID==='income-expense-summary-card').props.style.justifyContent,'flex-start');
 }
});
