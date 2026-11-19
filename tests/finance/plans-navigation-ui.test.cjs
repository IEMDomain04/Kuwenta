const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function harness(section) {
 const params={section},hooks=[],effects=[],scrolls=[];let cursor=0;
 const jsx=(type,props)=>({type,props});
 const sandbox={exports:{},require(name){
  if(name==='react')return{
   useState:initial=>{const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],value=>hooks[i]=value];},
   useRef:initial=>{const i=cursor++;return hooks[i]??(hooks[i]={current:initial});},
   useEffect:(fn,deps)=>{const i=cursor++;if(!hooks[i]||deps.some((value,index)=>value!==hooks[i][index])){hooks[i]=deps;effects.push(fn);}},
  };
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{ScrollView:'Scroll',View:'View'};
  if(name==='expo-router')return{useLocalSearchParams:()=>params,router:{setParams:value=>Object.assign(params,value)}};
  if(name==='../provider')return{useFinance:()=>({busy:false})};
  if(name.endsWith('/dates'))return{philippineDateTime:()=>({transactionDate:'2026-11-19'})};
  if(name.endsWith('/debts-overview'))return{DebtsOverview:'Debts'};
  if(name.endsWith('/budget-overview'))return{BudgetOverview:'Budgets'};
  if(name.endsWith('/savings-overview'))return{SavingsOverview:'Savings'};
  if(name.endsWith('/ui'))return{FinanceScreen:'Screen',AddTransactionButton:'Add'};
  throw new Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/screens/plans-screen.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,sandbox);
 function render(){cursor=0;const nodes=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(sandbox.exports.default());const screen=nodes.find(node=>node.type==='Screen');screen.props.scrollRef.current={scrollTo:options=>scrolls.push(options)};effects.splice(0).forEach(fn=>fn());return{screen,section:nodes.find(node=>node.type==='View'&&node.props.onLayout)};}
 return{render,params,scrolls};
}

test('View debts waits for layout and content size, scrolls once, and supports repeated requests',()=>{
 for(const contentFirst of [false,true]){
  const h=harness('debts');let {screen,section}=h.render();
  const size=()=>screen.props.onContentSizeChange(360,1500);
  const layout=()=>section.props.onLayout({nativeEvent:{layout:{y:800}}});
  (contentFirst?size:layout)();assert.equal(h.scrolls.length,0);
  (contentFirst?layout:size)();assert.equal(h.scrolls.length,1);
  assert.equal(h.scrolls[0].y,788);assert.equal(h.scrolls[0].animated,true);
  assert.equal(h.params.section,undefined);
  h.render();size();layout();assert.equal(h.scrolls.length,1);
  h.params.section='debts';h.render();assert.equal(h.scrolls.length,2);
 }
});

test('normal Plans navigation preserves the usual scroll position',()=>{
 const h=harness();const {screen,section}=h.render();
 screen.props.onContentSizeChange(360,1500);section.props.onLayout({nativeEvent:{layout:{y:800}}});
 assert.equal(h.scrolls.length,0);
});
