const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

test('holding budget feedback starts rearranging without expanding it; a normal tap still expands', () => {
  let expanded=false, holds=0;
  const jsx=(type,props)=>({type,props});
  const sandbox={exports:{},require(name){
    if(name==='react')return{useRef:value=>({current:value}),useState:()=>[expanded,update=>{expanded=update(expanded);} ]};
    if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
    if(name==='react-native')return{Pressable:'Button',View:'View'};
    if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
    if(name==='@/components/themed-text')return{ThemedText:'Text'};
    if(name==='@/hooks/use-theme')return{useTheme:()=>({})};
    if(name==='./category-visual')return{CategoryIcon:'CategoryIcon'};
    if(name==='../budgets')return{budgetFeedback:()=>({message:'Within budget',details:[]})};
    if(name==='../money')return require('../../.expo/finance-tests/money.js');
    throw new Error(name);
  }};
  const source=ts.transpileModule(fs.readFileSync('src/features/finance/components/budget-usage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,sandbox);
  const tree=sandbox.exports.BudgetUsage({row:{category:'Meals',spent:0,limitAmount:10000,progress:0,remaining:10000},available:10000,totalRemaining:10000,currentMonth:true,onHold:()=>{holds++;}});
  const nodes=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(tree);
  const button=nodes.find(node=>node.props.accessibilityLabel==='Meals budget feedback').props;
  button.onPressIn();button.onLongPress({nativeEvent:{pageY:40}});button.onPress();
  assert.equal(holds,1);assert.equal(expanded,false);
  button.onPressIn();button.onPress();assert.equal(expanded,true);
});
