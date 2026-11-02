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

test('Settings accepts the current visuals or none and explicitly reopens tracker setup',async()=>{
  for(const selection of [['activity','summary'],[]]){
    const h=harness('screens/settings-screen.tsx',{homeVisualizations:selection},{section:'visuals'});
    assert.ok(h.render().button('Use these visuals'));
    h.render().button('Use these visuals').props.onPress();await settle();
    assert.equal(JSON.stringify(h.saved[0]),JSON.stringify(selection));
    assert.ok(h.finance.trackerSetup.completed.includes('visuals'));
  }
  const h=harness('screens/settings-screen.tsx',{trackerSetup:null});
  h.render().button('Tracker setup').props.onPress();await settle();
  assert.equal(h.finance.trackerSetup.dismissed,false);
  assert.equal(h.navigation[0].pathname,'/');assert.equal(h.navigation[0].params.setup,'1');
});


test('Home mounts the setup checklist below the mascot, and supports reopening from Settings',()=>{
  const params={setup:'1'};
  const h=harness('screens/home-screen.tsx',{},params);
  const view=h.render();
  const checklist=view.nodes.find(node=>node.type==='TrackerSetupChecklist');
  assert.ok(checklist,'the checklist must be rendered on Home');
  assert.equal(checklist.props.forceVisible,true);
  assert.ok(view.nodes.indexOf(checklist)>view.nodes.findIndex(node=>node.type==='Gradient'));
  checklist.props.onClose();
  assert.equal(params.setup,undefined);
  assert.equal(h.render().nodes.find(node=>node.type==='TrackerSetupChecklist').props.forceVisible,false);
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
