const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function picker(){
 const state=[],effects=[],changed=[];let cursor=0;
 const jsx=(type,props)=>({type,props});
 const finance={month:'2026-11',currentMonth:'2026-11',setMonth:value=>changed.push(value)};
 const sandbox={exports:{},require(name){
  if(name==='react')return{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useEffect:(effect,deps)=>{const i=cursor++;if(!state[i]||deps.some((value,j)=>value!==state[i][j]))effects.push(effect);state[i]=deps;}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='react-native')return{View:'View',Modal:'Modal',Pressable:'Button',ScrollView:'ScrollView',FlatList:'FlatList',useWindowDimensions:()=>({height:800,fontScale:1})};
  if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView'};
  if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
  if(name==='@/components/themed-text')return{ThemedText:'Text'};
  if(name==='@/hooks/use-theme')return{useTheme:()=>({})};
  if(name==='../provider')return{useFinance:()=>finance};
  if(name==='./ui')return{ActionButton:'ActionButton'};
  throw new Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/components/home-month-picker.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 return{changed,render(props={}){cursor=0;const nodes=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(sandbox.exports.HomeMonthPicker(props));effects.splice(0).forEach(effect=>effect());return nodes;}};
}
test('Home month selection uses local callbacks without changing the shared reporting month',()=>{
 const h=picker(),chosen=[],opened=[];
 let nodes=h.render({value:'2026-10',onChange:value=>chosen.push(value),open:true,onOpenChange:value=>opened.push(value)});
 assert.equal(nodes.find(node=>node.type==='Modal').props.visible,true);
 nodes.find(node=>node.props.accessibilityLabel==='Sep 2026').props.onPress();
 assert.deepEqual(chosen,['2026-09']);assert.deepEqual(opened,[false]);assert.deepEqual(h.changed,[]);
 nodes=h.render({value:'2026-09',onChange:value=>chosen.push(value),open:false,onOpenChange:value=>opened.push(value)});
 nodes.find(node=>node.props.accessibilityLabel==='Choose reporting month, Sep 2026').props.onPress();assert.equal(opened.at(-1),true);
});
test('History keeps the original month picker behavior when no local callback is supplied',()=>{
 const h=picker();h.render().find(node=>node.props.accessibilityLabel==='Choose reporting month, Nov 2026').props.onPress();
 let nodes=h.render();assert.equal(nodes.find(node=>node.type==='Modal').props.visible,true);
 nodes.find(node=>node.props.accessibilityLabel==='Oct 2026').props.onPress();
 assert.deepEqual(h.changed,['2026-10']);assert.equal(h.render().find(node=>node.type==='Modal').props.visible,false);
});
