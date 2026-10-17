const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source=ts.transpileModule(fs.readFileSync('src/features/finance/components/period-overview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render(visible) {
  let reportCalls=0, activityCalls=0;
  const jsx=(type,props)=>({type,props});
  const sandbox={exports:{},require(name){
    if(name==='react')return{useState:initial=>[initial,()=>{}],useMemo:factory=>factory()};
    if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
    if(name==='react-native')return{View:'View',Pressable:'Button',useWindowDimensions:()=>({fontScale:1})};
    if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
    if(name==='@/components/themed-text')return{ThemedText:'Text'};
    if(name==='@/hooks/use-color-scheme')return{useColorScheme:()=> 'light'};
    if(name==='@/hooks/use-theme')return{useTheme:()=>({})};
    if(name==='./account-balances')return{AccountBalances:'Balances'};
    if(name==='./selection-sheet')return{SelectionSheet:'SelectionSheet'};
    if(name==='./dashboard-charts')return{SpendingTrend:'Trend',IncomeExpenseChart:'Comparison'};
    if(name==='./category-spending')return{CategorySpending:'Chart'};
    if(name==='../provider')return{useFinance:()=>({transactions:[]})};
    if(name==='../dashboard')return{activityWeek:(...args)=>{activityCalls++;return require('../../.expo/finance-tests/dashboard.js').activityWeek(...args);},dashboardReport:()=>{reportCalls++;return{start:'2026-10-12',end:'2026-10-12',income:0,expenses:0};},dashboardSpending:()=>{activityCalls++;return[];}};
    if(['../dates','../money','../home-visualizations'].includes(name))return require('../../.expo/finance-tests/'+name.slice(3)+'.js');
    throw new Error(name);
  }};
  vm.runInNewContext(source,sandbox);
  const tree=sandbox.exports.PeriodOverview({now:new Date('2026-10-12T04:00:00Z'),visible});
  const nodes=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(tree);
  return{tree,nodes,reportCalls,activityCalls};
}
test('every visualization combination renders only selected sections and skips hidden calculations',()=>{
  for(let mask=0;mask<64;mask++){
    const visible=['activity','summary','categories','trend','comparison','balances'].filter((_,i)=>mask&(1<<i));
    const h=render(visible);
    assert.equal(h.activityCalls,Number(visible.includes('activity'))+Number(visible.includes('trend')));
    assert.equal(h.reportCalls,visible.includes('summary')||visible.includes('categories')||visible.includes('comparison')?1:0);
    assert.equal(h.nodes.some(node=>node.type==='Trend'),visible.includes('trend'));
    assert.equal(h.nodes.some(node=>node.type==='Comparison'),visible.includes('comparison'));
    assert.equal(h.nodes.some(node=>node.type==='Chart'),visible.includes('categories'));
    assert.equal(h.nodes.some(node=>node.type==='Text'&&node.props.children==='THIS WEEK'),visible.includes('activity'));
    assert.equal(h.nodes.some(node=>node.props.accessibilityLabel==='Choose spending week'),visible.includes('activity'));
    if(visible.includes('activity')){
      const title=h.nodes.find(node=>node.type==='Text'&&node.props.children==='THIS WEEK');assert.equal(title.props.numberOfLines,1);assert.equal(title.props.style.flexShrink,0);
      const picker=h.nodes.find(node=>node.props.accessibilityLabel==='Choose spending week');assert.equal(picker.props.style.minHeight,24);
    }
    assert.ok(!h.nodes.some(node=>['Previous spending week','Next spending week'].includes(node.props.accessibilityLabel)));
    assert.ok(!h.nodes.some(node=>node.type==='Text'&&JSON.stringify(node.props.children).includes('so far')));
    assert.equal(h.nodes.some(node=>node.type==='Text'&&node.props.children==='Income'),visible.includes('summary'));
    assert.equal(h.nodes.filter(node=>node.props.accessibilityLabel==='day report').length,visible.includes('summary')||visible.includes('categories')||visible.includes('comparison')||visible.includes('trend')?1:0);
    assert.equal(h.nodes.some(node=>node.type==='Balances'),visible.includes('balances'));
    if(visible.includes('balances') && visible.includes('summary'))assert.ok(h.nodes.findIndex(node=>node.props.children==='Income')<h.nodes.findIndex(node=>node.type==='Balances'));
    if(visible.includes('balances') && visible.includes('categories'))assert.ok(h.nodes.findIndex(node=>node.type==='Balances')<h.nodes.findIndex(node=>node.type==='Chart'));
    if(mask===0)assert.equal(h.tree,null);
  }
});
