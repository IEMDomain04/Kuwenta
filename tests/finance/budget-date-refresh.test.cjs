const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const dates = require('../../.expo/finance-tests/domain/dates.js');
const { cash } = require('./fixtures.cjs');
const settle = () => new Promise(resolve=>setImmediate(resolve));

test('provider renews on startup, at Philippine midnight while open, and on resume; stops polling in background',async()=>{
 let now='2026-10-30T15:59:00Z',cursor=0,listener,closed=0,timerId=0;
 const states=[],effects=[],timers=new Map(),renewed=[];
 function state(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}
 const jsx=(type,props)=>({type,props:props??{}});
 const db={getFirstAsync:async sql=>sql.includes('cashSetupComplete')?{value:'1'}:null,closeAsync:async()=>{closed++;}};
 const imports={
  react:{createContext:()=>({Provider:'Context'}),useState:state,useRef:initial=>state(()=>({current:initial}))[0],useMemo:fn=>fn(),useEffect:(callback,deps)=>effects.push({callback,deps})},
  'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-native':{AppState:{currentState:'active',addEventListener:(_,callback)=>{listener=callback;return{remove(){listener=undefined;}};}},Platform:{OS:'android'}},
  '@/hooks/use-theme':{useTheme:()=>({})},
  './storage/database':{openFinanceDatabase:async()=>db},
  './storage/budgets':{renewBudgets:async(_,date)=>{renewed.push(date);return[];}},
  './storage/accounts':{listAccounts:async()=>[cash]},
  './storage/transactions':{listTransactions:async()=>[]},
  './storage/goals':{listGoals:async()=>[]},
  './storage/debts':{listDebts:async()=>[],listDebtPayments:async()=>[],listDebtAdditions:async()=>[]},
  './domain/debts':{validateDebtRecords(){}},
  './reporting/home-visualizations':{loadHomeVisualizations:async()=>[]},
  './domain/calculations':{calculateFinanceSummary:()=>({balance:0,monthlyIncome:0,monthlyExpenses:0}),calculateCurrentMoney:()=>({availableMoney:0})},
  './domain/dates':{...dates,philippineDateTime:()=>dates.philippineDateTime(new Date(now))},
  './integrations/widgets':{syncWidgets:async()=>{}},
  './integrations/notifications':{syncNotifications:async()=>{}},
 };
 const exports={};
 const source=ts.transpileModule(fs.readFileSync('src/features/finance/provider.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(source,{exports,require:name=>imports[name]??{},console,setInterval:(callback)=>{timers.set(++timerId,callback);return timerId;},clearInterval:id=>timers.delete(id),setTimeout,clearTimeout});
 const render=()=>{cursor=0;return exports.FinanceProvider({children:'child'});};
 render();const cleanup=effects.find(effect=>effect.deps?.length===0).callback();
 await settle();await settle();assert.deepEqual(renewed,['2026-10-30']);
 [...timers.values()][0]();await settle();assert.equal(renewed.length,1);
 now='2026-10-30T16:00:00Z';[...timers.values()][0]();await settle();await settle();
 assert.deepEqual(renewed,['2026-10-30','2026-10-31']);assert.equal(render().props.value.currentDate,'2026-10-31');
 listener('background');assert.equal(timers.size,0);
 now='2026-11-01T01:00:00Z';listener('active');await settle();await settle();
 assert.equal(renewed.at(-1),'2026-11-01');assert.equal(render().props.value.currentDate,'2026-11-01');assert.equal(timers.size,1);
 cleanup();await settle();assert.equal(timers.size,0);assert.equal(closed,1);
});
