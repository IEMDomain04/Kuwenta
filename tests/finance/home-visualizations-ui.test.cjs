const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const sources = Object.fromEntries(['period-overview', 'spending-activity', 'income-expense-summary', 'daily-spending-sheet', 'daily-spending-chart','spending-day-details','income-sources'].map(name => [name, ts.transpileModule(fs.readFileSync('src/features/finance/components/home/' + name + '.tsx', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText]));
const source = sources['period-overview'];
function render(visible, transactions = [], now = new Date('2026-11-03T04:00:00Z'), options = {}) {
  let reportCalls=0, activityCalls=0, cursor=0; const hooks=[],navigation=[];let activeHooks=hooks;const detailHooks=new Map();
  const jsx=(type,props,key)=>({type,props:{...props,...(key===undefined?{}:{testKey:key})}});
  const sandbox={exports:{},require(name){
    if(name==='@/hooks/amount-visibility')return{useAmountVisibility:()=>({hidden:!!options.hidden,formatAmount:options.hidden?()=>'hidden':require('../../.expo/finance-tests/domain/money.js').formatMoney,conceal:text=>options.hidden?text.replace(/(?:\u20b1|PHP\s*)[\d,.]+/g,'hidden'):text})};
    if(name==='react')return{useState:initial=>{const slots=activeHooks,index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>slots[index]=typeof value==='function'?value(slots[index]):value];},useMemo:factory=>factory()};
    if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
    if(name==='react-native')return{View:'View',Pressable:'Button',Modal:'Modal',ScrollView:'ScrollView',useWindowDimensions:()=>({fontScale:options.fontScale??1,width:options.width??390,height:800})};
    if(name==='react-native-svg')return{__esModule:true,default:'Svg',Line:'Line'};
    if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView'};
    if(name==='expo-router')return{router:{push:value=>navigation.push(value)}};
    if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
    if(name==='@/components/themed-text')return{ThemedText:'Text'};
    if(name==='@/hooks/use-color-scheme')return{useColorScheme:()=> 'light'};
    if(name==='@/hooks/use-theme')return{useTheme:()=>options.theme??{}};
    if(name==='../accounts/account-balances')return{AccountBalances:'Balances'};
    if (sources[name.slice(2)]) {
      const component = {...sandbox, exports:{}};
      vm.runInNewContext(sources[name.slice(2)], component);
      return component.exports;
    }
    if(name==='./home-month-picker')return{HomeMonthPicker:'MonthPicker'};
    if(name==='../shared/ui')return{ActionButton:'ActionButton'};
    if(name==='../shared/selection-sheet')return{SelectionSheet:'SelectionSheet'};
    if(name==='./dashboard-charts')return{SpendingTrend:'Trend',IncomeExpenseChart:'Comparison'};
    if(name==='./category-spending')return{CategorySpending:'Chart'};
    if(name==='../../provider')return{useFinance:()=>({transactions})};
    if(name==='../../reporting/dashboard')return{activityWeek:(...args)=>{activityCalls++;return require('../../.expo/finance-tests/reporting/dashboard.js').activityWeek(...args);},dashboardReport:(...args)=>{reportCalls++;return require('../../.expo/finance-tests/reporting/dashboard.js').dashboardReport(...args);},dashboardSpending:(...args)=>{activityCalls++;return require('../../.expo/finance-tests/reporting/dashboard.js').dashboardSpending(...args);}};
    if(['../../domain/dates','../../domain/money','../../reporting/home-visualizations','../../reporting/home-reporting','../../reporting/reporting','../../reporting/income-sources','../../domain/types','../../reporting/daily-cash-flow'].includes(name))return require('../../.expo/finance-tests/'+name.replace(/^(?:\.\.?\/)+/, '')+'.js');
    throw new Error(name);
  }};
  vm.runInNewContext(source,sandbox);
  function snapshot(nextVisible=visible){visible=nextVisible;cursor=0;
  const tree=sandbox.exports.PeriodOverview({now,visible});
  const nodes=[],seen=new Set();function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;if(typeof node.type==='function'){
    if(node.type.name==='SpendingDayDetails'){const key=node.props.testKey;seen.add(key);const oldCursor=cursor,oldSlots=activeHooks;activeHooks=detailHooks.get(key)??[];detailHooks.set(key,activeHooks);cursor=0;walk(node.type(node.props));cursor=oldCursor;activeHooks=oldSlots;return;}
    return walk(node.type(node.props));
  }nodes.push(node);walk(node.props.children);}walk(tree);for(const key of detailHooks.keys())if(!seen.has(key))detailHooks.delete(key);
  return{tree,nodes,reportCalls,activityCalls,navigation,rerender:snapshot};
  } return snapshot();
}
test('every visualization combination renders only selected sections and skips hidden calculations',()=>{
  for(let mask=0;mask<256;mask++){
    const visible=['activity','summary','categories','trend','comparison','balances','daily-spending','income-sources'].filter((_,i)=>mask&(1<<i));
    const h=render(visible);
    assert.equal(h.activityCalls,Number(visible.includes('activity')||visible.includes('trend')||visible.includes('daily-spending')));
    assert.equal(h.reportCalls,visible.includes('summary')||visible.includes('categories')||visible.includes('comparison')||visible.includes('income-sources')?1:0);
    assert.equal(h.nodes.some(node=>node.props.testID==='daily-spending-chart'),visible.includes('daily-spending'));
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

test('monthly dates toggle inline spending and transactions without a drawer',()=>{
 const {record}=require('./fixtures.cjs');const {readableTransactionDate}=require('../../.expo/finance-tests/domain/dates.js');
 const rows=[record({id:'lunch',notes:'Lunch',amount:12345,transactionDate:'2026-10-01'}),record({id:'income',type:'INCOME',amount:90000,transactionDate:'2026-10-01'})];
 let h=render(['activity','summary'],rows);h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-month');h=h.rerender();
 assert.ok(!h.nodes.some(node=>node.type==='Modal'));
 const day=()=>h.nodes.find(node=>node.type==='Button'&&node.props.accessibilityLabel?.startsWith(readableTransactionDate('2026-10-01')+', ')&&node.props.accessibilityLabel?.endsWith(' spent'));
 day().props.onPress();h=h.rerender();assert.equal(day().props.accessibilityState.selected,true);
 assert.ok(!h.nodes.some(node=>node.props.accessibilityLabel?.startsWith('View Lunch, ')));
 h.nodes.find(node=>node.props.label==='View transactions').props.onPress();h=h.rerender();
 let transaction=h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('View Lunch, '));assert.ok(transaction);
 assert.ok(h.nodes.indexOf(transaction)<h.nodes.findIndex(node=>node.props.label==='Hide transactions'));
 assert.ok(h.nodes.some(node=>node.props.testID==='spending-day-details'));
 assert.ok(!h.nodes.some(node=>node.type==='Modal'||node.props.accessibilityLabel==='Open daily spending'));
 assert.ok(h.nodes.findIndex(node=>node.props.testID==='income-expense-summary-card')<h.nodes.findIndex(node=>node.props.testID==='spending-day-details'));
 day().props.onPress();h=h.rerender();assert.ok(!h.nodes.some(node=>node.props.testID==='spending-day-details'));
 day().props.onPress();h=h.rerender();h.nodes.find(node=>node.props.label==='View transactions').props.onPress();h=h.rerender();transaction=h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('View Lunch, '));transaction.props.onPress();
 assert.equal(h.navigation[0].pathname,'/transaction');assert.equal(h.navigation[0].params.id,'lunch');
});

test('amount privacy also masks inline daily spending labels and transaction descriptions',()=>{
 const {record}=require('./fixtures.cjs');
 let h=render(['activity','summary'],[record({transactionDate:'2026-10-01',amount:12345,notes:'Lunch PHP 123.45'})],undefined,{hidden:true});
 h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-month');h=h.rerender();
 h.nodes.find(node=>node.type==='Button'&&node.props.accessibilityLabel?.endsWith('hidden spent')).props.onPress();h=h.rerender();
 h.nodes.find(node=>node.props.label==='View transactions').props.onPress();h=h.rerender();
 const text=JSON.stringify(h.nodes.filter(node=>node.type==='Text').map(node=>node.props.children));
 assert.ok(!text.includes('123.45'));assert.ok(text.includes('Lunch hidden'));
 assert.ok(h.nodes.filter(node=>node.props.accessibilityLabel).every(node=>!node.props.accessibilityLabel.includes('123.45')));
});


test('mirrored summary compares real daily income and expenses on one scale and toggles day details',()=>{
 const {record}=require('./fixtures.cjs');
 const rows=[record({id:'income',type:'INCOME',amount:10000,transactionDate:'2026-10-01'}),record({id:'expense',amount:30000,transactionDate:'2026-10-01'}),record({id:'transfer',type:'TRANSFER',amount:999999,transactionDate:'2026-10-01'})];
 let h=render(['summary'],rows);
 h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-month');h=h.rerender();
 const upper=h.nodes.find(node=>node.props.testID==='summary-income-2026-10-01');
 const lower=h.nodes.find(node=>node.props.testID==='summary-expense-2026-10-01');
 assert.ok(Math.abs(upper.props.style.height/lower.props.style.height-1/3)<0.001);
 assert.equal(h.nodes.find(node=>node.props.testID==='income-expense-summary-content').props.style.flexDirection,'row');
 const day=()=>h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('October 1, 2026, income'));
 day().props.onPress();h=h.rerender();assert.ok(h.nodes.some(node=>node.props.accessibilityLiveRegion==='polite'));
 day().props.onPress();h=h.rerender();assert.ok(!h.nodes.some(node=>node.props.accessibilityLiveRegion==='polite'));
 h=render(['summary'],rows);assert.equal(h.nodes.find(node=>node.props.testID==='income-expense-summary-content').props.style.flexDirection,'row');
 const empty=render(['summary']);assert.ok(empty.nodes.filter(node=>node.props.testID?.startsWith('summary-income-')||node.props.testID?.startsWith('summary-expense-')).every(node=>node.props.style.height===0));
});

test('daily spending bars compare actual expenses, toggle details, and leave future days unavailable', () => {
  const {record} = require('./fixtures.cjs');
  const {readableTransactionDate} = require('../../.expo/finance-tests/domain/dates.js');
  const rows = [
    record({id:'mon',transactionDate:'2026-11-02',amount:10000}),
    record({id:'tue',transactionDate:'2026-11-03',amount:20000}),
    record({id:'income',type:'INCOME',transactionDate:'2026-11-03',amount:90000}),
    record({id:'transfer',type:'TRANSFER',transactionDate:'2026-11-03',amount:80000}),
    record({id:'future',transactionDate:'2026-11-05',amount:999999}),
  ];
  let h = render(['daily-spending'], rows);
  const bars = () => h.nodes.filter(node => node.props.testID?.startsWith('daily-spending-bar-'));
  const buttons = () => h.nodes.filter(node => node.type==='Button' && node.props.accessibilityState?.selected !== undefined);
  const detail = () => h.nodes.find(node => node.props.accessibilityLiveRegion==='polite');
  const scale = h.nodes.find(node=>node.props.testID==='daily-spending-scale');
  assert.ok(scale);
  assert.ok(JSON.stringify(scale.props.children).includes('200'));
  assert.ok(h.nodes.some(node=>JSON.stringify(node.props.children).includes('November 2, 2026')));
  assert.equal(bars().length, 7);
  h.nodes.find(node=>node.type==='ScrollView').props.onLayout({nativeEvent:{layout:{width:330}}}); h=h.rerender();
  const guides=h.nodes.find(node=>node.props.testID==='daily-spending-guides');
  assert.ok(guides);
  assert.equal(guides.props.pointerEvents,'none');
  const lines=h.nodes.filter(node=>node.type==='Line');
  assert.equal(lines.length,3);
  assert.ok(lines.every(line=>line.props.y1===line.props.y2));
  assert.equal(bars()[0].props.style.height, 64);
  assert.equal(bars()[1].props.style.height, 128);
  assert.ok(bars().slice(2).every(node => node.props.style.height===2));
  assert.equal(buttons()[2].props.disabled, true);
  assert.equal(detail(), undefined);
  buttons()[1].props.onPress(); h=h.rerender();
  assert.equal(buttons()[1].props.accessibilityState.selected, true);
  assert.ok(JSON.stringify(detail().props.children).includes(readableTransactionDate('2026-11-03')));
  assert.ok(JSON.stringify(detail().props.children).includes('200.00'));
  buttons()[1].props.onPress(); h=h.rerender();
  assert.equal(detail(), undefined);
  buttons()[0].props.onPress(); h=h.rerender();
  h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-week'); h=h.rerender();
  assert.equal(detail(), undefined);
  assert.ok(h.nodes.some(node=>node.props.children==='No expenses recorded for this period.'));
});

test('monthly spending bars scroll, follow custom months, and keep amounts hidden', () => {
  const {record} = require('./fixtures.cjs');
  let h = render(['daily-spending'], [record({id:'oct',transactionDate:'2026-10-01',amount:12345})], undefined, {hidden:true,theme:{accent:'#74DCA6',backgroundSelected:'#264937'}});
  h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-month'); h=h.rerender();
  const bars = () => h.nodes.filter(node=>node.props.testID?.startsWith('daily-spending-bar-'));
  const buttons = () => h.nodes.filter(node=>node.type==='Button' && node.props.accessibilityState?.selected !== undefined);
  assert.equal(bars().length,31);
  assert.equal(h.nodes.find(node=>node.type==='ScrollView').props.horizontal,true);
  assert.equal(h.nodes.find(node=>node.type==='ScrollView').props.showsHorizontalScrollIndicator,false);
  assert.ok(h.nodes.some(node=>node.props.children==='Swipe for more'));
  h.nodes.find(node=>node.type==='ScrollView').props.onLayout({nativeEvent:{layout:{width:330}}}); h=h.rerender();
  const barWidth=buttons()[0].props.style.width;
  const fullBars=Math.floor((330+6)/(barWidth+6));
  assert.ok(Math.abs((330-fullBars*(barWidth+6))/barWidth-0.5)<0.01, 'the next bar is half visible');
  const thumb=()=>h.nodes.find(node=>node.props.testID==='daily-spending-scroll-thumb');
  assert.equal(thumb().props.style.backgroundColor,'#74DCA6');
  assert.equal(thumb().props.style.transform[0].translateX,0);
  h.nodes.find(node=>node.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{x:200}}}); h=h.rerender();
  assert.ok(thumb().props.style.transform[0].translateX>0);
  buttons()[0].props.onPress(); h=h.rerender();
  assert.ok(h.nodes.some(node=>node.props.accessibilityLiveRegion==='polite'));
  const text=JSON.stringify(h.nodes.filter(node=>node.type==='Text').map(node=>node.props.children));
  assert.ok(text.includes('hidden')); assert.ok(!text.includes('123.45'));
  assert.ok(h.nodes.every(node=>!node.props.accessibilityLabel?.includes('123.45')));
  h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('custom'); h=h.rerender();
  h.nodes.find(node=>node.type==='MonthPicker').props.onChange('2024-02'); h=h.rerender();
  assert.equal(bars().length,29);
  assert.equal(thumb().props.style.transform[0].translateX,0);
  assert.ok(bars().every(node=>Number.isFinite(node.props.style.height)));
  assert.ok(!h.nodes.some(node=>node.props.accessibilityLiveRegion==='polite'));
});


test('Home starts without charts until the user chooses a visualization',()=>{
  assert.equal(render(undefined).tree,null);
});

test('income visual is optional, follows the period, toggles source details and masks amounts',()=>{
 const {record}=require('./fixtures.cjs');
 const rows=[record({id:'salary',type:'INCOME',category:'Salary',amount:20000,transactionDate:'2026-11-02'}),record({id:'expense',amount:90000,transactionDate:'2026-11-02'}),record({id:'future',type:'INCOME',amount:99999,transactionDate:'2026-11-04'})];
 let h=render(['income-sources'],rows);
 assert.ok(h.nodes.some(node=>node.props.testID==='income-sources'));
 let source=h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('Salary, '));
 source.props.onPress();h=h.rerender();
 assert.ok(h.nodes.some(node=>node.props.accessibilityLabel?.startsWith('View income, Salary')));
 h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('Salary, ')).props.onPress();h=h.rerender();
 assert.ok(!h.nodes.some(node=>node.props.accessibilityLabel?.startsWith('View income, Salary')));
 h=render(['income-sources'],rows,undefined,{hidden:true});
 assert.ok(!JSON.stringify(h.nodes.filter(node=>node.type==='Text').map(node=>node.props.children)).includes('200'));
});
test('monthly inline details clear when the shared reporting period changes',()=>{
 let h=render(['activity']);h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('month');h=h.rerender();
 h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('November 2, 2026, ')).props.onPress();h=h.rerender();
 assert.ok(h.nodes.some(node=>node.props.testID==='spending-day-details'));
 h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('last-month');h=h.rerender();
 assert.ok(!h.nodes.some(node=>node.props.testID==='spending-day-details'));
 assert.equal(h.nodes.filter(node=>node.props.testID==='spending-calendar-day').length,31);
});

test('activity and summary reset their native layout immediately when enabled in either order',()=>{
 for(const first of ['summary','activity']){
  let h=render([first]);
  assert.equal(h.nodes.find(node=>node.props.testID==='activity-summary-layout').props.testKey,'stacked');
  for(let index=0;index<3;index++){
   h=h.rerender([first,...(first==='summary'?['activity']:['summary'])]);
   const wrapper=h.nodes.find(node=>node.props.testID==='activity-summary-layout');
   assert.equal(wrapper.props.testKey,'paired');assert.equal(wrapper.props.style.flexDirection,'row');assert.equal(wrapper.props.style.alignItems,'stretch');
   const activity=h.nodes.find(node=>node.props.testID==='spending-activity-card');const summary=h.nodes.find(node=>node.props.testID==='income-expense-summary-card');
   assert.equal(activity.props.style.flexGrow,58);assert.equal(summary.props.style.flexGrow,42);
   assert.equal(activity.props.style.flexBasis,0);assert.equal(summary.props.style.flexBasis,0);
   assert.equal(activity.props.style.width,'auto');assert.equal(summary.props.style.width,'auto');
   assert.ok(h.nodes.indexOf(activity)<h.nodes.indexOf(summary));
   h=h.rerender([first]);
   const solo=h.nodes.find(node=>node.props.testID=== (first==='summary'?'income-expense-summary-card':'spending-activity-card'));
   assert.equal(solo.props.style.flexGrow,0);assert.equal(solo.props.style.flexBasis,'auto');assert.equal(solo.props.style.width,'100%');
  }
 }
});

test('weekly tiles keep their original dimensions while standalone monthly calendars get taller',()=>{
 for(const visible of [['activity'],['activity','summary']]){
  let h=render(visible);assert.ok(h.nodes.some(node=>node.props.style?.width==='100%'&&node.props.style?.minHeight===30&&node.props.style?.aspectRatio===undefined));
  h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('month');h=h.rerender();
  const calendar=h.nodes.find(node=>node.props.testID==='spending-calendar');
  assert.ok(visible.includes('summary')?calendar.props.style.height===124:calendar.props.style.height>124);
 }
});
test('mirrored graph and dashed guides appear only in the standalone summary',()=>{
 for(const visible of [['summary'],['activity','summary']]){
  const h=render(visible);const alone=!visible.includes('activity');
  assert.equal(h.nodes.some(node=>node.props.testID==='income-expense-mirrored-chart'),alone);
  assert.equal(h.nodes.filter(node=>node.props.testID==='summary-chart-guide').length,alone?3:0);
  assert.ok(h.nodes.some(node=>node.props.children==='Income'));
  assert.ok(h.nodes.some(node=>node.props.children==='Expenses'));
  if(alone)assert.ok(h.nodes.filter(node=>node.props.testID==='summary-chart-guide').every(node=>node.props.style.borderStyle==='dashed'));
  assert.ok(!h.nodes.some(node=>node.props.testID==='summary-chart-explanation'||node.props.children==='Income and expenses'));
 }
});

test('summary hides financial amounts and ignores future income in the selected month',()=>{
 const {record}=require('./fixtures.cjs');let h=render(['summary'],[record({type:'INCOME',amount:12345,transactionDate:'2026-11-02'}),record({id:'future',type:'INCOME',amount:99999,transactionDate:'2026-11-20'})],undefined,{hidden:true});
 h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('month');h=h.rerender();
 const text=JSON.stringify(h.nodes.filter(node=>node.type==='Text').map(node=>node.props.children));
 assert.ok(!text.includes('123.45'));assert.ok(text.includes('hidden'));
 assert.equal(h.nodes.find(node=>node.props.testID==='summary-income-2026-11-20').props.style.height,0);
 assert.ok(h.nodes.filter(node=>node.props.accessibilityLabel).every(node=>!node.props.accessibilityLabel.includes('123.45')));
});

test('enabling both visuals keeps summary numbers only even when the cards stack on a small screen',()=>{
 const h=render(['activity','summary'],[],undefined,{width:320});
 assert.ok(!h.nodes.some(node=>node.props.testID==='income-expense-mirrored-chart'));
});

test('inline monthly details show five records first and reveal more without including income',()=>{
 const {record}=require('./fixtures.cjs');const rows=Array.from({length:7},(_,index)=>record({id:'spent'+index,notes:'Item '+index,transactionDate:'2026-11-02'}));
 let h=render(['activity'],rows);h.nodes.find(node=>node.type==='SelectionSheet').props.onSelect('month');h=h.rerender();
 h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('November 2, 2026, ')).props.onPress();h=h.rerender();
 h.nodes.find(node=>node.props.label==='View transactions').props.onPress();h=h.rerender();
 assert.equal(h.nodes.filter(node=>node.props.accessibilityLabel?.startsWith('View Item')).length,5);
 h.nodes.find(node=>node.props.label==='Show more transactions').props.onPress();h=h.rerender();
 assert.equal(h.nodes.filter(node=>node.props.accessibilityLabel?.startsWith('View Item')).length,7);
});
test('summary amount typography is identical with or without activity tiles',()=>{
 const values=[['summary'],['activity','summary']].map(visible=>render(visible).nodes.filter(node=>node.type==='Text'&&node.props.style?.fontVariant&&node.props.style?.fontSize===16).map(node=>JSON.stringify(node.props.style)));
 assert.deepEqual(values[0],values[1]);assert.equal(values[0].length,2);
});

test('weekly tiles and daily bars keep transactions collapsed until requested',()=>{
 const {record}=require('./fixtures.cjs');const rows=[record({notes:'Lunch',transactionDate:'2026-11-02',amount:5000})];
 for(const visual of ['activity','daily-spending']){
  let h=render([visual],rows);h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('November 2, 2026, ')).props.onPress();h=h.rerender();
  assert.ok(!h.nodes.some(node=>node.props.accessibilityLabel?.startsWith('View Lunch')));
  h.nodes.find(node=>node.props.label==='View transactions').props.onPress();h=h.rerender();
  const transaction=h.nodes.find(node=>node.props.accessibilityLabel?.startsWith('View Lunch'));assert.ok(transaction);
  assert.ok(h.nodes.indexOf(transaction)<h.nodes.findIndex(node=>node.props.label==='Hide transactions'));
  h.nodes.find(node=>node.props.label==='Hide transactions').props.onPress();h=h.rerender();
  assert.ok(!h.nodes.some(node=>node.props.accessibilityLabel?.startsWith('View Lunch')));
 }
});

test('weekly daily bars fit all seven days in the viewport without horizontal scrolling',()=>{
 for(const plotWidth of [160,208,280]){
  let h=render(['daily-spending'],[],undefined,{width:320,fontScale:1.5});
  h.nodes.find(node=>node.type==='ScrollView').props.onLayout({nativeEvent:{layout:{width:plotWidth}}});h=h.rerender();
  const plot=h.nodes.find(node=>node.type==='ScrollView');
  assert.equal(plot.props.scrollEnabled,false);assert.equal(plot.props.contentContainerStyle.width,'100%');
  const days=h.nodes.filter(node=>node.type==='Button'&&node.props.accessibilityState?.selected!==undefined);
  assert.equal(days.length,7);assert.ok(days.every(day=>day.props.style.minWidth===0&&day.props.style.flexBasis===0&&day.props.style.flex===1));
  assert.ok(h.nodes.some(node=>node.type==='Text'&&node.props.children==='Sun'));
  assert.equal(h.nodes.find(node=>node.props.testID==='daily-spending-guides').props.width,plotWidth);
  assert.ok(!h.nodes.some(node=>node.props.testID==='daily-spending-scroll-track'));
 }
});
