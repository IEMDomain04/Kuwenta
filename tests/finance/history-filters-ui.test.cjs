const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const {cash,record}=require('./fixtures.cjs');
function harness(dark=false){
 const hooks=[];let cursor=0;const jsx=(type,props)=>({type,props});
 const finance={accounts:[cash,{...cash,id:'bank',name:'Bank'}],transactions:[record({id:'cash-expense'}),record({id:'bank-income',type:'INCOME',category:'Salary',accountId:'bank'})],month:'2026-10',busy:false};
 const sandbox={exports:{},require(name){
  if(name==='react')return{useState:initial=>{const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],value=>hooks[i]=value];},useRef:value=>({current:value}),useEffect(){}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{View:'View',Pressable:'Button',ScrollView:'ScrollView',SectionList:'SectionList'};
  if(name==='expo-linear-gradient')return{LinearGradient:'Gradient'};
  if(name==='@/hooks/use-color-scheme')return{useColorScheme:()=> dark?'dark':'light'};
  if(name.endsWith('/accounts/account-icon'))return{AccountIcon:'AccountIcon'};
  if(name==='expo-router')return{router:{setParams(){},push(){}},useLocalSearchParams:()=>({})};
  if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
  if(name==='@/components/themed-text')return{ThemedText:'Text'};
  if(name==='@/hooks/use-theme')return{useTheme:()=>({accent:'green',accentPressed:'strong-green',onAccent:dark?'black':'white',backgroundSelected:'gray',text:dark?'white':'black',backgroundElement:dark?'black':'white'})};
  if(name==='../provider')return{useFinance:()=>finance};
  if(name.endsWith('/confirmation'))return{useConfirmation:()=>({alert(){}})};
  if(name.endsWith('/shared/ui'))return{FinanceScreen:'Screen',TransactionRow:'Row',ActionButton:'Action',AddTransactionButton:'Add'};
  if(name.endsWith('/home-month-picker'))return{HomeMonthPicker:'MonthPicker'};
  if(name.startsWith('../domain/')||name.startsWith('../reporting/'))return require('../../.expo/finance-tests/'+name.slice(3)+'.js');
  throw new Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/screens/transactions-screen.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,sandbox);
 function render(){cursor=0;const nodes=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(sandbox.exports.default());return nodes;}
 return{render};
}
test('history accounts retain a half chip and scroll cue below type and month filters',()=>{
 const h=harness();let nodes=h.render();
 nodes.find(node=>node.props.testID==='history-account-strip').props.onLayout({nativeEvent:{layout:{width:330}}});nodes=h.render();
 const chip=nodes.find(node=>node.props.accessibilityLabel==='All accounts');const width=chip.props.style.width;
 assert.ok(Math.abs((330-2*(width+6))/width-0.5)<0.01);
 const thumb=()=>nodes.find(node=>node.props.testID==='history-account-scroll-thumb');
 assert.equal(thumb().props.style.backgroundColor,'green');
 nodes.find(node=>node.props.testID==='history-account-strip').props.onScroll({nativeEvent:{contentOffset:{x:50}}});nodes=h.render();
 assert.ok(thumb().props.style.transform[0].translateX>0);
 const filters=nodes.find(node=>node.type==='Button'&&Array.isArray(node.props.children)&&node.props.children.some(child=>child?.props?.children==='Income'));
 assert.ok(nodes.findIndex(node=>node.type==='MonthPicker')<nodes.findIndex(node=>node.props.accessibilityLabel==='All accounts'));
 assert.equal(nodes.find(node=>node.type==='MonthPicker').props.fullWidth,true);
 assert.equal(nodes.find(node=>node.props.testID==='history-type-filters').props.style.width,'100%');
 assert.ok(nodes.indexOf(filters)<nodes.findIndex(node=>node.type==='MonthPicker'));
 const bank=nodes.find(node=>node.props.accessibilityLabel==='Bank');
 assert.equal(bank.props.style.backgroundColor,'white');
 assert.equal(bank.props.style.minHeight,44);
 assert.ok(!nodes.some(node=>node.type==='Gradient'));
 assert.equal(bank.props.style.borderWidth,undefined);
 assert.equal(nodes.filter(node=>node.type==='AccountIcon').length,2);
});
test('rearranged history controls still combine account and transaction type filters',()=>{
 const h=harness();let nodes=h.render();
 nodes.find(node=>node.props.accessibilityLabel==='Bank').props.onPress();nodes=h.render();
 const income=nodes.find(node=>node.type==='Button'&&Array.isArray(node.props.children)&&node.props.children.some(child=>child?.props?.children==='Income'));
 income.props.onPress();nodes=h.render();
 assert.ok(!nodes.some(node=>node.props.label==='Reset account'));
 const rows=nodes.find(node=>node.type==='SectionList').props.sections.flatMap(section=>section.data);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'bank-income');
});

test('borderless account chips use tinted selection and solid check badges in both themes',()=>{
 for(const dark of [false,true]){
  const h=harness(dark);let nodes=h.render();
  nodes.find(node=>node.props.accessibilityLabel==='Bank').props.onPress();nodes=h.render();
  const selected=nodes.find(node=>node.props.accessibilityLabel==='Bank');
  assert.equal(selected.props.accessibilityState.selected,true);
  assert.equal(selected.props.style.backgroundColor,'gray');
  assert.equal(selected.props.style.borderWidth,undefined);
  assert.equal(nodes.filter(node=>node.props.testID==='history-account-selection-ring').length,0);
  const badge=nodes.find(node=>node.props.testID==='history-account-selected-badge');
  assert.equal(badge.props.style.backgroundColor,'strong-green');
  assert.equal(badge.props.children.props.color,dark?'black':'white');
  nodes.find(node=>node.props.accessibilityLabel==='All accounts').props.onPress();nodes=h.render();
  assert.equal(nodes.find(node=>node.props.accessibilityLabel==='Bank').props.accessibilityState.selected,false);
  assert.equal(nodes.filter(node=>node.props.testID==='history-account-selected-badge').length,1);
 }
});
