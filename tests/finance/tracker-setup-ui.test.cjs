const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const setupApi=require('../../.expo/finance-tests/storage/tracker-setup.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(file, initial={}, params={}) {
  let cursor=0;const hooks=[],effects=[],navigation=[],saved=[],finished=[];
  const finance={accounts:[require('./fixtures.cjs').cash],transactions:[],budgets:[],goals:[],debts:[],debtPayments:[],debtAdditions:[],month:'2026-11',busy:false,trackerSetup:setupApi.initialTrackerSetup(),homeVisualizations:['activity','summary'],displayName:'Ana',showNotice(){},...initial};
  finance.saveTrackerSetup=async value=>{saved.push(value);finance.trackerSetup=value;};
  finance.saveHomeVisualizations=async value=>{saved.push(value);finance.homeVisualizations=value;if(finance.trackerSetup)finance.trackerSetup={...finance.trackerSetup,completed:[...finance.trackerSetup.completed,'visuals']};};
  const state=initial=>{const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],value=>hooks[i]=typeof value==='function'?value(hooks[i]):value];};
  const jsx=(type,props)=>({type,props});
  const sandbox={exports:{},require(name){
    if(name==='react')return{useMemo:factory=>factory(),useState:state,useRef:initial=>state(()=>({current:initial}))[0],useEffect:(callback,deps)=>{const i=cursor++;const previous=hooks[i];if(!previous||!deps||deps.some((value,index)=>value!==previous[index])){hooks[i]=deps;effects.push(callback);}}};
    if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
    if(name==='react-native')return{View:'View',Pressable:'Pressable',ScrollView:'ScrollView',Modal:'Modal',TextInput:'Input',KeyboardAvoidingView:'AvoidingView',Platform:{OS:'android'},StyleSheet:{create:value=>value},AppState:{currentState:'background',addEventListener:()=>({remove(){}})},useWindowDimensions:()=>({height:800,fontScale:1}),Keyboard:{dismiss(){},addListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>({remove(){}})}};
    if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView'};
    if(name==='expo-linear-gradient')return{LinearGradient:'Gradient'};
    if(name==='@/hooks/amount-visibility')return{useAmountVisibility:()=>({hidden:false,formatAmount:require('../../.expo/finance-tests/domain/money.js').formatMoney,conceal:text=>text})};
    if(name==='expo-image')return{Image:'Image'};
    if(name==='expo-router')return{useLocalSearchParams:()=>params,router:{push:value=>navigation.push(value),setParams:value=>Object.assign(params,value)}};
    if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
    if(name==='@/components/themed-text')return{ThemedText:'Text'};
    if(name==='@/hooks/use-theme')return{useTheme:()=>({accent:'#06633E'})};
    if(name==='@/hooks/appearance-provider')return{useAppearance:()=>({mode:'light',setMode(){}})};
    if(name.endsWith('/provider'))return{useFinance:()=>finance};
    if(name.endsWith('/storage/tracker-setup'))return setupApi;
    if(name.endsWith('/reporting/home-visualizations'))return require('../../.expo/finance-tests/reporting/home-visualizations.js');
    if(name.endsWith('/domain/money'))return require('../../.expo/finance-tests/domain/money.js');
    if(name.endsWith('/ui'))return{ActionButton:'Action',FinanceScreen:'Screen',AddTransactionButton:'Add'};
    if(name.endsWith('/components/home/tracker-setup'))return{TrackerSetupChecklist:'TrackerSetupChecklist'};
    if(name.endsWith('/amount-visibility-button'))return{AmountVisibilityButton:'Visibility'};
    if(name.endsWith('/budget-overview'))return{BudgetOverview:'BudgetOverview'};
    if(name.endsWith('/period-overview'))return{PeriodOverview:'PeriodOverview'};
    if(name.endsWith('/category-visual'))return{CategoryIcon:'CategoryIcon'};
    if(name.includes('/reporting/')||name.endsWith('/domain/dates')||name.endsWith('/domain/exchanges'))return require('../../.expo/finance-tests/'+name.replace(/^(?:\.\.?\/)+/,'')+'.js');
    if(name.endsWith('/insights-sheet'))return{InsightsSheet:'InsightsSheet'};
    if(name.endsWith('/insight-item'))return{InsightItem:'InsightItem'};
    if(name.endsWith('/field-error'))return{FieldError:'Error'};
    if(name.endsWith('/money-field'))return{MoneyField:'MoneyField'};
    if(name.endsWith('/notification-settings'))return{NotificationSettingsPanel:'Notifications'};
    if(name.endsWith('/confirmation'))return{useConfirmation:()=>({alert(){}})};
    if(name.endsWith('/backup-export'))return{BackupExport:'BackupExport'};
    if(name.endsWith('/backup-import-preview'))return{BackupImportPreview:'BackupImportPreview'};
    if(name.endsWith('.png'))return name;
    throw new Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,sandbox);
  function render(props={}) {
    cursor=0;const component=sandbox.exports.CashSetup??sandbox.exports.TrackerSetupChecklist??sandbox.exports.default;
    const tree=component({busy:false,onComplete:async(...args)=>finished.push(args),...props});
    const nodes=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(tree);
    effects.splice(0).forEach(callback=>callback());
    return{tree,nodes,button:label=>nodes.find(node=>node.props.label===label||node.props.accessibilityLabel===label)};
  }
  return{render,finance,saved,navigation,finished};
}

test('onboarding requires a name, accepts a blank zero balance, and introduces Home visuals before finishing',async()=>{
  const h=harness('components/shared/cash-setup.tsx');
  h.render().button('Next').props.onPress();
  h.render().button('Next').props.onPress();
  assert.ok(h.render().nodes.some(node=>node.props.message==='Enter your name.'));
  h.render().button('Your name').props.onChangeText('Ana');
  for(let i=0;i<4;i++)h.render().button('Next').props.onPress();
  assert.ok(h.render().nodes.some(node=>node.type==='Notifications'));
  h.render().button('Next').props.onPress();
  assert.ok(h.render().nodes.some(node=>node.props.children==='Make Home yours'));
  assert.equal(h.render().button('Start tracking'),undefined);
  h.render().button('Next').props.onPress();
  h.render().button('Start tracking').props.onPress();await settle();
  assert.equal(JSON.stringify(h.finished),JSON.stringify([[0,'Ana','Cash',false]]));
});

test('Home checklist guides the next action, permits optional skips, and hides after completion or dismissal',async()=>{
  const h=harness('components/home/tracker-setup.tsx');
  assert.equal(h.render().button('Set up your tracker').props.accessibilityState.expanded,true);
  assert.ok(!h.render().nodes.some(node=>node.type==='Icon'&&node.props.name==='checkmark-circle'));
  h.render().button('Set up your accounts').props.onPress();
  assert.equal(h.navigation[0],'/accounts');
  h.finance.trackerSetup.completed.push('accounts');
  h.render().button('Choose your Home visuals').props.onPress();
  assert.equal(h.navigation[1].pathname,'/settings');assert.equal(h.navigation[1].params.section,'visuals');
  h.finance.trackerSetup.completed.push('visuals','transaction');
  h.render().button('Skip create a budget').props.onPress();await settle();
  h.render().button('Skip add a savings goal').props.onPress();await settle();
  assert.equal(h.render().tree,null);
  let view=h.render({forceVisible:true});
  assert.ok(view.tree);
  view.button('Set up your tracker').props.onPress();
  assert.equal(h.render({forceVisible:true}).nodes.some(node=>node.props.children==='Skipped for now'),false);
  h.render({forceVisible:true}).button('Close checklist').props.onPress();await settle();
  assert.equal(h.finance.trackerSetup.dismissed,true);
  assert.equal(h.render().tree,null);
  const existing=harness('components/home/tracker-setup.tsx',{trackerSetup:null});
  assert.equal(existing.render().tree,null);
});

test('Settings keeps visualization selection without checklist actions',async()=>{
  const h=harness('screens/settings-screen.tsx',{homeVisualizations:['activity','summary']},{section:'visuals'});
  const view=h.render();
  assert.ok(!view.nodes.some(node=>node.props?.label==='Tracker setup' || node.props?.label==='Use these visuals'));
  view.button('Select none').props.onPress();await settle();
  assert.equal(JSON.stringify(h.saved[0]),'[]');
});

test('Home does not show the tracker checklist',()=>{
  const h=harness('screens/home-screen.tsx',{}, {setup:'1'});
  assert.ok(!h.render().nodes.some(node=>node.type==='TrackerSetupChecklist'));
});

test('onboarding distinguishes an explicitly entered zero or amount from a cleared balance',async()=>{
  for(const [value,cents,confirmed] of [['0',0,true],['125.50',12550,true],['',0,false]]){
    const h=harness('components/shared/cash-setup.tsx');
    h.render().button('Next').props.onPress();
    h.render().button('Your name').props.onChangeText('Ana');
    for(let i=0;i<3;i++)h.render().button('Next').props.onPress();
    const field=h.render().button('Starting balance in pesos');
    field.props.onValueChange('100');
    field.props.onValueChange(value);
    for(let i=0;i<3;i++)h.render().button('Next').props.onPress();
    h.render().button('Start tracking').props.onPress();await settle();
    assert.equal(JSON.stringify(h.finished),JSON.stringify([[cents,'Ana','Cash',confirmed]]));
  }
});

test('Home keeps exchange outcomes explicitly labelled on the right, including after edits',()=>{
 const {exchangeDraft,exchangeRecords}=require('../../.expo/finance-tests/domain/exchanges.js');
 const bank={...require('./fixtures.cjs').cash,id:'bank',name:'MariBank'};
 const h=harness('screens/home-screen.tsx',{accounts:[require('./fixtures.cjs').cash,bank]});
 for(const [paid,received,label] of [[9500,10000,'Earnings: '],[10000,9500,'Loss: '],[10000,10000,'']]){
  h.finance.transactions=exchangeRecords('sale',exchangeDraft('bank',{kind:'Service sale',paid,received,receivedAccountId:'cash',extraAccountId:'cash',earningsConfirmed:true},'2026-11-16','12:00:00'),'2026-11-16T04:00:00Z');
  const view=h.render();
  const summaries=view.nodes.filter(node=>node.props.testID==='recent-exchange-summary');
  assert.equal(summaries.length,1);
  const expected=label+require('../../.expo/finance-tests/domain/money.js').formatMoney(Math.abs(received-paid)||paid,true);
  assert.equal(summaries[0].props.children,expected);
  assert.equal(summaries[0].props.numberOfLines,undefined);
  assert.equal(summaries[0].props.style.textAlign,'right');
  assert.ok(!view.nodes.some(node=>Array.isArray(node.props.children)&&node.props.children[0]==='+'));
 }
});
