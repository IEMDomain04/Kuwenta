const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const example={message:'You spent \u20b120 more.',title:'\u20b120 more spent',summary:'Compared with last month.',icon:'trending-up-outline',calculation:'Matched periods exclude transfers.',figures:[{label:'October 1-11, 2026',value:'\u20b1120'}],action:{label:'Review expenses',pathname:'/(tabs)/transactions',month:'2026-10',params:{type:'EXPENSE'}}};
function harness(hidden=false,dark=false) {
 let cursor=0;const hooks=[],effects=[],navigation=[],months=[];let closed=0;
 const jsx=(type,props)=>({type,props});
 const sandbox={exports:{},require(name){
  if(name==='react')return{useState:initial=>{const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],value=>hooks[i]=value];},useEffect:(callback)=>effects.push(callback)};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{View:'View',Pressable:'Button',Modal:'Modal',ScrollView:'Scroll',useWindowDimensions:()=>({height:800})};
  if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeArea'};
  if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
  if(name==='expo-router')return{router:{push:route=>navigation.push(route)}};
  if(name==='@/components/themed-text')return{ThemedText:'Text'};
  if(name==='@/hooks/use-theme')return{useTheme:()=>({text:dark?'white':'black',backgroundElement:dark?'black':'white',backgroundSelected:'green'})};
  if(name==='@/hooks/amount-visibility')return{useAmountVisibility:()=>({conceal:value=>hidden?value.replace(/\u20b1[\d,.]+/g,'hidden'):value})};
  if(name==='../../provider')return{useFinance:()=>({setMonth:month=>months.push(month)})};
  throw new Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/components/shared/insights-sheet.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,sandbox);
 let props={visible:true,insights:[example],onClose:()=>closed++};
 function render(patch={}) {props={...props,...patch};cursor=0;const nodes=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(sandbox.exports.InsightsSheet(props));effects.splice(0).forEach(fn=>fn());return nodes;}
 return{render,navigation,months,get closed(){return closed;}};
}
const text=nodes=>nodes.filter(node=>node.type==='Text').map(node=>node.props.children).join(' ');
const open=nodes=>nodes.find(node=>node.props.accessibilityHint==='Opens the supporting figures and explanation').props.onPress();

test('insight sheet opens details, goes back, and reviews the matching records',()=>{
 const h=harness();let nodes=h.render();
 assert.ok(!text(nodes).includes(example.calculation));
 open(nodes);nodes=h.render();
 assert.ok(text(nodes).includes(example.figures[0].value));
 assert.ok(!text(nodes).includes(example.calculation));
 const help=nodes.find(node=>node.props.accessibilityLabel==='How this is calculated');
 assert.equal(help.props.accessibilityState.expanded,false);
 help.props.onPress();nodes=h.render();
 assert.ok(text(nodes).includes(example.calculation));
 assert.equal(nodes.find(node=>node.props.accessibilityLabel==='How this is calculated').props.accessibilityState.expanded,true);
 assert.equal(nodes.find(node=>node.props.testID==='insight-figures').props.style.borderTopWidth,1);
 assert.equal(nodes.find(node=>node.props.testID==='insight-figures').props.style.borderBottomWidth,1);
 assert.ok(nodes.some(node=>node.props.testID==='insight-calculation-drawer'));
 nodes.find(node=>node.props.accessibilityLabel==='Close calculation').props.onPress();nodes=h.render();
 assert.ok(!text(nodes).includes(example.calculation));
 assert.ok(text(nodes).includes(example.figures[0].value));
 assert.equal(nodes.find(node=>node.props.testID==='insight-meaning').props.style.gap,4);
 const action=nodes.find(node=>node.type==='Text'&&node.props.children==='Review expenses');
 assert.equal(action.props.numberOfLines,1);
 assert.equal(action.props.style.flex,1);
 nodes.find(node=>node.props.accessibilityLabel==='Back to insights').props.onPress();
 nodes=h.render();assert.ok(!text(nodes).includes(example.calculation));
 open(nodes);nodes=h.render();
 nodes.find(node=>node.type==='Button'&&node.props.children?.[0]?.props?.children==='Review expenses').props.onPress();
 assert.deepEqual(h.months,['2026-10']);assert.equal(h.navigation[0].params.type,'EXPENSE');assert.equal(h.closed,1);
 nodes=h.render();assert.ok(!text(nodes).includes(example.calculation));
});

test('privacy covers featured titles, supporting summaries, figures, explanations and accessibility in both themes',()=>{
 for(const dark of [false,true]){
  const h=harness(true,dark);let nodes=h.render();
  assert.ok(!JSON.stringify(nodes).includes('\u20b1'));
  open(nodes);nodes=h.render();
  assert.ok(!JSON.stringify(nodes).includes('\u20b1'));
  nodes.find(node=>node.props.accessibilityLabel==='How this is calculated').props.onPress();nodes=h.render();
  assert.ok(!JSON.stringify(nodes).includes('\u20b1'));
  assert.ok(text(nodes).includes(example.calculation));
  assert.match(text(nodes),/hidden/);
 }
});

test('Android back first returns to the list, and reopening or removing an insight clears its details',()=>{
 const h=harness();let nodes=h.render();open(nodes);nodes=h.render();
 nodes.find(node=>node.type==='Modal').props.onRequestClose();nodes=h.render();
 assert.equal(h.closed,0);assert.ok(!text(nodes).includes(example.calculation));
 open(nodes);nodes=h.render({visible:false});nodes=h.render({visible:true});
 assert.ok(!text(nodes).includes(example.calculation));
 open(nodes);nodes=h.render({insights:[]});assert.ok(!text(nodes).includes(example.calculation));
});

test('calculation drawer closes on Android back before leaving the insight',()=>{
 const h=harness();let nodes=h.render();open(nodes);nodes=h.render();
 nodes.find(node=>node.props.accessibilityLabel==='How this is calculated').props.onPress();nodes=h.render();
 assert.ok(nodes.some(node=>node.props.testID==='insight-calculation-drawer'));
 assert.ok(nodes.some(node=>node.props.accessibilityElementsHidden===true));
 nodes.find(node=>node.type==='Modal').props.onRequestClose();nodes=h.render();
 assert.ok(!nodes.some(node=>node.props.testID==='insight-calculation-drawer'));
 assert.ok(text(nodes).includes(example.figures[0].value));
 assert.equal(h.closed,0);
 nodes.find(node=>node.type==='Modal').props.onRequestClose();nodes=h.render();
 assert.ok(!text(nodes).includes(example.figures[0].value));assert.equal(h.closed,0);
});
