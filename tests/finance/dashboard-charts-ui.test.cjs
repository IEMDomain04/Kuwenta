const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function charts() {
 const jsx=(type,props)=>({type,props});
 const sandbox={exports:{},require(name){
  if(name==='react')return{useState:initial=>[initial,()=>{}]};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{View:'View'};
  if(name==='react-native-svg')return{__esModule:true,default:'Svg',Circle:'Circle',Line:'Line',Polyline:'Polyline'};
  if(name==='@/components/themed-text')return{ThemedText:'Text'};
  if(name==='@/hooks/use-theme')return{useTheme:()=>({})};
  if(['../dates','../money'].includes(name))return require('../../.expo/finance-tests/'+name.slice(3)+'.js');
  throw new Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/components/dashboard-charts.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,sandbox);
 return sandbox.exports;
}
function nodes(tree){const found=[];function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;found.push(node);walk(node.props.children);}walk(tree);return found;}
test('optional charts handle empty, single-day and monthly data without invalid geometry',()=>{
 const api=charts();
 for(const count of [0,1,31]){
  const days=Array.from({length:count},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),expenses:count===1?6000:i*100}));
  const rendered=nodes(api.SpendingTrend({days,period:'month'}));
  const line=rendered.find(node=>node.type==='Polyline');
  if(line)for(const value of line.props.points.split(/[ ,]/))assert.ok(Number.isFinite(Number(value)));
  else assert.ok(rendered.some(node=>node.props.children==='No expenses recorded for this period.'));
 }
 for(const [income,expenses] of [[0,0],[100,0],[0,100],[100,200]]){
  const bars=nodes(api.IncomeExpenseChart({income,expenses})).filter(node=>typeof node.props.style?.width==='string');
  assert.equal(bars.length,2);
  for(const bar of bars){const width=Number.parseFloat(bar.props.style.width);assert.ok(Number.isFinite(width)&&width>=0&&width<=100);}
 }
});
test('all account colors are distinct and keep readable text in both themes',()=>{
 const {ACCOUNT_CARD_COLORS}=require('../../.expo/finance-tests/account-colors.js');
 function luminance(hex){const rgb=hex.match(/[0-9a-f]{2}/gi).map(channel=>parseInt(channel,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;}
 for(const theme of ['light','dark']){
  const colors=Object.values(ACCOUNT_CARD_COLORS).map(preset=>preset[theme]);assert.equal(new Set(colors).size,colors.length);
  const text=luminance(theme==='light'?'#FFFFFF':'#082417');
  for(const color of colors){const background=luminance(color);assert.ok((Math.max(text,background)+0.05)/(Math.min(text,background)+0.05)>=4.5,color+' has insufficient text contrast');}
 }
});
