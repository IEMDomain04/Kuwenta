const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function charts(hidden = false) {
 const states=[];let cursor=0;const navigation=[];
 const jsx=(type,props)=>({type,props});
 const sandbox={exports:{},require(name){
    if(name==='@/hooks/amount-visibility')return{useAmountVisibility:()=>({hidden,formatAmount:(amount,trim)=>hidden?String.fromCodePoint(8226).repeat(4):require('../../.expo/finance-tests/money.js').formatMoney(amount,trim),conceal:text=>text})};
  if(name==='react')return{useMemo:fn=>fn(),useRef(initial){const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i];},useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{View:'View',Pressable:'Pressable',Modal:'Modal',ScrollView:'ScrollView',useWindowDimensions:()=>({height:800}),PanResponder:{create:config=>({panHandlers:config})}};
  if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView'};
  if(name==='@react-native-vector-icons/ionicons')return{Ionicons:'Icon'};
  if(name==='expo-router')return{router:{push:route=>navigation.push(route)}};
  if(name==='react-native-svg')return{__esModule:true,default:'Svg',Circle:'Circle',Line:'Line',Polyline:'Polyline'};
  if(name==='@/components/themed-text')return{ThemedText:'Text'};
  if(name==='@/hooks/use-theme')return{useTheme:()=>({})};
  if(['../dates','../money'].includes(name))return require('../../.expo/finance-tests/'+name.slice(3)+'.js');
  throw new Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/components/dashboard-charts.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,sandbox);
 const api=sandbox.exports;const render=api.SpendingTrend;api.SpendingTrend=props=>{cursor=0;return render(props);};api.navigation=navigation;return api;
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


test('hidden chart values do not expose amounts in text, chart labels, or point details', () => {
 const api=charts(true);
 const rendered=[...nodes(api.SpendingTrend({days:[{date:'2026-10-18',expenses:12345}],period:'day'})),...nodes(api.IncomeExpenseChart({income:98765,expenses:12345}))];
 for(const node of rendered){
   const label=node.props.accessibilityLabel??'';
   const text=typeof node.props.children==='string'?node.props.children:Array.isArray(node.props.children)?node.props.children.filter(item=>typeof item==='string').join(' '):'';
   for(const value of ['123.45','987.65',String.fromCodePoint(8369)])assert.ok(!(label+' '+text).includes(value));
 }
 assert.ok(rendered.some(node=>String(node.props.accessibilityLabel).includes(String.fromCodePoint(8226).repeat(4))));
});


test('spending trend omits upcoming points, identifies the peak date, and selects days from the plot', () => {
 const api=charts();
 const {record}=require('./fixtures.cjs');
 const now=new Date('2026-10-02T04:00:00Z');
 const props={period:'month',now,days:[{date:'2026-10-01',expenses:12000},{date:'2026-10-02',expenses:0},{date:'2026-10-03',expenses:999999}],transactions:[record({id:'fee:extra',exchangeParentId:'exchange',transactionDate:'2026-10-01',amount:12000,category:'Fees',notes:'Cash-in charge'}),record({id:'income',transactionDate:'2026-10-01',type:'INCOME',amount:50000})]};
 let tree=nodes(api.SpendingTrend(props));
 assert.equal(tree.filter(node=>node.type==='Circle').length,2);
 const peak=tree.find(node=>String(node.props.accessibilityLabel).startsWith('Highest spending:'));
 assert.ok(peak.props.accessibilityLabel.includes('October 1'));
 assert.ok(peak.props.accessibilityLabel.includes('120'));
 assert.equal(tree.filter(node=>node.type==='Line').length,3);
 const plot=tree.find(node=>node.props.onLayout);
 plot.props.onLayout({nativeEvent:{layout:{width:300}}});
 tree=nodes(api.SpendingTrend(props));
 tree.find(node=>node.props.onLayout).props.onPress({nativeEvent:{locationX:8}});
 tree=nodes(api.SpendingTrend(props));
 const transaction=tree.find(node=>String(node.props.accessibilityLabel).startsWith('View Cash-in charge,'));
 assert.ok(transaction);transaction.props.onPress();assert.equal(api.navigation[0].params.id,'exchange');
 assert.equal(tree.filter(node=>String(node.props.accessibilityLabel).startsWith('View ')).length,1);
 tree.find(node=>node.props.onLayout).props.onPress({nativeEvent:{locationX:292}});
 assert.ok(nodes(api.SpendingTrend(props)).some(node=>String(node.props.accessibilityLabel).startsWith('View Cash-in charge,')));
 tree=nodes(api.SpendingTrend(props));tree.find(node=>node.props.onLayout).props.onPress({nativeEvent:{locationX:8}});
 assert.ok(!nodes(api.SpendingTrend(props)).some(node=>String(node.props.accessibilityLabel).startsWith('View Cash-in charge,')));
});

test('daily spending list offers large selected day controls and distinguishes zero spending from upcoming', () => {
 const api=charts();const props={period:'week',now:new Date('2026-10-02T04:00:00Z'),days:[{date:'2026-10-01',expenses:0},{date:'2026-10-02',expenses:100},{date:'2026-10-03',expenses:0}]};
 let tree=nodes(api.SpendingTrend(props));tree.find(node=>node.props.accessibilityLabel==='Daily spending').props.onPress();
 tree=nodes(api.SpendingTrend(props));
 const buttons=tree.filter(node=>node.props.accessibilityRole==='button' && / spent$|Upcoming$/.test(node.props.accessibilityLabel??''));
 assert.equal(buttons.length,3);
 for(const button of buttons)assert.ok(button.props.style({pressed:false}).minHeight>=44);
 assert.equal(buttons[2].props.disabled,true);assert.ok(!buttons[2].props.accessibilityLabel.includes('spent'));
 buttons[0].props.onPress();tree=nodes(api.SpendingTrend(props));
 assert.ok(tree.some(node=>node.props.children==='No expenses recorded on this day.'));
 assert.ok(!tree.some(node=>node.type==='Modal'));
 tree.find(node=>node.props.accessibilityLabel==='Daily spending').props.onPress();
 tree=nodes(api.SpendingTrend(props));
 const selected=tree.find(node=>node.props.accessibilityState?.selected);
 assert.ok(selected.props.accessibilityLabel.includes('October 1'));selected.props.onPress();
 tree=nodes(api.SpendingTrend(props));
 assert.ok(!tree.some(node=>node.type==='Modal'));
 assert.ok(tree.some(node=>node.props.children==='No expenses recorded on this day.'));
});

test('trend privacy masking covers scale, peak, selected records, and the daily list', () => {
 const api=charts(true);const {record}=require('./fixtures.cjs');
 const props={period:'day',now:new Date('2026-10-02T04:00:00Z'),days:[{date:'2026-10-01',expenses:12345}],transactions:[record({transactionDate:'2026-10-01',amount:12345,notes:'Lunch'})]};
 let tree=nodes(api.SpendingTrend(props));tree.find(node=>node.props.accessibilityLabel==='Daily spending').props.onPress();
 tree=nodes(api.SpendingTrend(props));tree.find(node=>String(node.props.accessibilityLabel).endsWith('spent')).props.onPress();
 const rendered=nodes(api.SpendingTrend(props));
 for(const node of rendered){const text=JSON.stringify([node.props.accessibilityLabel,node.type==='Text'?node.props.children:null]);assert.ok(!text.includes('123.45'));assert.ok(!text.includes(String.fromCodePoint(8369)));}
 assert.ok(rendered.some(node=>String(node.props.accessibilityLabel).startsWith('View Lunch,')));
});


test('horizontal scrubbing previews days without records until release, keeps vertical scrolling and clamps future dates', () => {
 const {record}=require('./fixtures.cjs');
 for(const hidden of [false,true]){
  const api=charts(hidden);
  const props={period:'month',now:new Date('2026-10-02T04:00:00Z'),days:[{date:'2026-10-01',expenses:100},{date:'2026-10-02',expenses:200},{date:'2026-10-03',expenses:0}],transactions:[record({id:'one',transactionDate:'2026-10-01',amount:100,notes:'First day'}),record({id:'two',transactionDate:'2026-10-02',amount:200,notes:'Second day'})]};
  let tree=nodes(api.SpendingTrend(props));
  tree.find(node=>node.props.onLayout).props.onLayout({nativeEvent:{layout:{width:300}}});
  tree=nodes(api.SpendingTrend(props));
  const pan=()=>nodes(api.SpendingTrend(props)).find(node=>node.props.onPanResponderGrant).props;
  assert.equal(pan().onMoveShouldSetPanResponderCapture(null,{dx:20,dy:2,numberActiveTouches:1}),true);
  assert.equal(pan().onMoveShouldSetPanResponderCapture(null,{dx:2,dy:20,numberActiveTouches:1}),false);
  assert.equal(pan().onMoveShouldSetPanResponderCapture(null,{dx:3,dy:0,numberActiveTouches:1}),false);
  assert.equal(pan().onMoveShouldSetPanResponderCapture(null,{dx:20,dy:1,numberActiveTouches:2}),false);
  pan().onPanResponderGrant({nativeEvent:{pageX:108,locationX:8}});
  pan().onPanResponderMove(null,{moveX:250});
  tree=nodes(api.SpendingTrend(props));
  assert.ok(tree.some(node=>node.props.accessibilityLiveRegion==='none' && JSON.stringify(node.props.children).includes('October 2')));
  assert.equal(tree.filter(node=>String(node.props.accessibilityLabel).startsWith('View ')).length,0);
  assert.ok(tree.some(node=>node.type==='Circle' && node.props.cx===150 && node.props.r===5));
  assert.equal(pan().onPanResponderTerminationRequest(),false);
  pan().onPanResponderMove(null,{moveX:9999});
  pan().onPanResponderRelease();
  tree=nodes(api.SpendingTrend(props));
  assert.ok(tree.some(node=>String(node.props.accessibilityLabel).startsWith('View Second day,')));
  assert.ok(tree.some(node=>node.props.accessibilityLiveRegion==='polite' && JSON.stringify(node.props.children).includes('October 2')));
  assert.ok(!JSON.stringify(api.SpendingTrend(props)).includes('Upcoming days are not plotted'));
  if(hidden)for(const node of tree){const text=JSON.stringify([node.props.accessibilityLabel,node.type==='Text'?node.props.children:null]);assert.ok(!text.includes(String.fromCodePoint(8369)));}
  pan().onPanResponderGrant({nativeEvent:{pageX:108,locationX:8}});
  pan().onPanResponderMove(null,{moveX:-500});
  tree=nodes(api.SpendingTrend(props));
  assert.ok(tree.some(node=>node.type==='Circle' && node.props.cx===8 && node.props.r===5));
  pan().onPanResponderTerminate();
  assert.ok(nodes(api.SpendingTrend(props)).some(node=>String(node.props.accessibilityLabel).startsWith('View Second day,')));
 }
});


test('trend header keeps the period in its row and monthly day selection stays inside a bounded dismissible modal', () => {
 const api=charts();const {record}=require('./fixtures.cjs');
 const props={period:'month',now:new Date('2026-10-15T04:00:00Z'),days:Array.from({length:31},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),expenses:(i+1)*100})),transactions:[record({transactionDate:'2026-10-12',amount:1200,notes:'School lunch'})]};
 let tree=nodes(api.SpendingTrend(props));
 assert.ok(tree.some(node=>node.type==='View' && node.props.style?.flexDirection==='row' && Array.isArray(node.props.children) && node.props.children[0]?.props?.children==='Spending trend' && node.props.children[1]?.props?.children==='This month'));
 assert.ok(!tree.some(node=>node.type==='Modal'));
 assert.ok(!tree.some(node=>/ spent$|Upcoming$/.test(node.props.accessibilityLabel??'')));
 tree.find(node=>node.props.accessibilityLabel==='Daily spending').props.onPress();
 tree=nodes(api.SpendingTrend(props));
 assert.equal(tree.find(node=>node.type==='Modal').props.visible,true);
 assert.equal(tree.find(node=>node.type==='ScrollView').props.style.maxHeight,400);
 assert.equal(tree.filter(node=>/ spent$|Upcoming$/.test(node.props.accessibilityLabel??'')).length,31);
 tree.find(node=>node.type==='Modal').props.onRequestClose();
 assert.ok(!nodes(api.SpendingTrend(props)).some(node=>node.type==='Modal'));
 tree=nodes(api.SpendingTrend(props));tree.find(node=>node.props.accessibilityLabel==='Daily spending').props.onPress();
 tree=nodes(api.SpendingTrend(props));
 tree.find(node=>node.props.accessibilityLabel==='Close daily spending' && node.props.style?.width===44).props.onPress();
 assert.ok(!nodes(api.SpendingTrend(props)).some(node=>node.type==='Modal'));
 tree=nodes(api.SpendingTrend(props));tree.find(node=>node.props.accessibilityLabel==='Daily spending').props.onPress();
 tree=nodes(api.SpendingTrend(props));
 tree.find(node=>String(node.props.accessibilityLabel).startsWith('October 12,') && node.props.accessibilityRole==='button').props.onPress();
 tree=nodes(api.SpendingTrend(props));
 assert.ok(!tree.some(node=>node.type==='Modal'));
 assert.ok(tree.some(node=>String(node.props.accessibilityLabel).startsWith('View School lunch,')));
});
