const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
function harness({ deferredMeasurements = false, failFirst = false } = {}) {
  const hooks = []; let cursor = 0;
  const saved = [], scrolling = [], measurements = [];
  const rows = ['Meals','Snacks','Groceries'].map(category => ({category,limitAmount:10000}));
  const heights = [80,120,100], tops = [0,92,224];
  const state = initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], value => {hooks[index] = value;}]; };
  const jsx = (type, props) => ({type,props});
  const sandbox = {exports:{},require(name) {
    if (name === 'react') return {useState:state,useRef:value=>state(()=>({current:value}))[0],useEffect(){}};
    if (name === 'react/jsx-runtime') return {jsx,jsxs:jsx};
    if (name === 'react-native') return {View:'View',Pressable:'Pressable',Vibration:{vibrate(){}},PanResponder:{create:handlers=>({panHandlers:handlers})}};
    if (name === '@react-native-vector-icons/ionicons') return {Ionicons:'Icon'};
    if (name === '@/hooks/use-theme') return {useTheme:()=>({textSecondary:'#555'})};
    if (name === '@/components/themed-text') return {ThemedText:'Text'};
    throw new Error(name);
  }};
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/components/budget-list.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,sandbox);
  function render() {
    cursor=0; const nodes=[];
    function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; nodes.push(node); walk(node.props.children); }
    walk(sandbox.exports.BudgetList({rows,disabled:false,onDraggingChange:value=>scrolling.push(value),onReorder:async ids=>{ saved.push(Array.from(ids)); if (failFirst && saved.length === 1) throw new Error('Save failed'); rows.sort((a,b)=>ids.indexOf(a.category)-ids.indexOf(b.category)); },renderRow:row=>jsx('Row',{category:row.category})}));
    nodes.filter(node=>node.props.ref).forEach((node,i)=>node.props.ref({measureInWindow:cb=>{ const measure=()=>cb(0,tops[i],300,heights[i]); if(deferredMeasurements) measurements.push(measure); else measure(); }}));
    return {handles:nodes.filter(node=>node.type==='Pressable').map(node=>node.props),pan:nodes.find(node=>node.props.onPanResponderMove).props,positions:nodes.filter(node=>typeof node.type==='function'&&node.type.name==='MovingBudget').map(node=>node.props.y)};
  }
  return {render,saved,scrolling,flushMeasurements:(count=measurements.length)=>measurements.splice(0,count).forEach(measure=>measure())};
}
test('budget drag previews variable-height neighbors and saves only on release', () => {
  const h=harness(); let {handles,pan}=h.render();
  handles[0].onLongPress({nativeEvent:{pageY:40}});
  ({pan}=h.render()); pan.onPanResponderMove(null,{moveY:274});
  assert.deepEqual(h.render().positions,[234,-92,-92]);
  assert.deepEqual(h.saved,[]);
  pan.onPanResponderRelease();
  assert.deepEqual(h.saved,[['Snacks','Groceries','Meals']]);
  assert.deepEqual(h.scrolling,[true,false]);
});
test('canceled and unchanged budget drags preserve saved order', () => {
  for (const cancel of [true,false]) {
    const h=harness(); let {handles,pan}=h.render();
    handles[0].onLongPress({nativeEvent:{pageY:40}});
    ({pan}=h.render()); pan.onPanResponderMove(null,{moveY:cancel?274:40});
    if (cancel) pan.onPanResponderTerminate(); else pan.onPanResponderRelease();
    assert.deepEqual(h.saved,[]);
    assert.deepEqual(h.render().positions,[0,0,0]);
    assert.deepEqual(h.scrolling,[true,false]);
  }
});
test('budget order can also be changed with accessibility actions', () => {
  const h=harness(); h.render().handles[1].onAccessibilityAction({nativeEvent:{actionName:'decrement'}});
  assert.deepEqual(h.saved,[['Snacks','Meals','Groceries']]);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
test('budget cards can be moved repeatedly after successful saves and a failed save', async () => {
  for (const failFirst of [false,true]) {
    const h=harness({failFirst});
    for (let attempt=0;attempt<3;attempt++) {
      let {handles,pan}=h.render();
      handles[0].onLongPress({nativeEvent:{pageY:40}});
      ({pan}=h.render()); pan.onPanResponderMove(null,{moveY:274}); pan.onPanResponderRelease();
      await settle();
      assert.equal(h.saved.length,attempt+1);
      assert.deepEqual(h.render().positions,[0,0,0]);
    }
    assert.deepEqual(h.scrolling,[true,false,true,false,true,false]);
  }
});
test('late measurements remain valid after the finger starts moving', () => {
  const h=harness({deferredMeasurements:true}); let {handles,pan}=h.render();
  handles[0].onLongPress({nativeEvent:{pageY:40}}); h.flushMeasurements(1);
  ({pan}=h.render()); pan.onPanResponderMove(null,{moveY:274});
  h.flushMeasurements(); pan.onPanResponderMove(null,{moveY:274}); pan.onPanResponderRelease();
  assert.deepEqual(h.saved,[['Snacks','Groceries','Meals']]);
});
