const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

test('Android time picker uses AM/PM and keeps stored wall time and seconds intact', () => {
  let opened; const changed=[];
  const jsx=(type,props)=>({type,props});
  const sandbox={exports:{},require(name) {
    if (name==='react') return {useState:initial=>[initial,()=>{}],useRef:value=>({current:value}),useEffect(){}};
    if (name==='react/jsx-runtime') return {jsx,jsxs:jsx};
    if (name==='react-native') return {Keyboard:{dismiss(){}},Platform:{OS:'android'},Pressable:'Button',View:'View'};
    if (name==='@react-native-community/datetimepicker') return {DateTimePickerAndroid:{open:options=>{opened=options;}}};
    if (name==='@react-native-vector-icons/ionicons') return {Ionicons:'Icon'};
    if (name==='@/components/themed-text') return {ThemedText:'Text'};
    if (name==='@/hooks/use-theme') return {useTheme:()=>({})};
    if (name==='@/hooks/use-color-scheme') return {useColorScheme:()=> 'light'};
    if (name==='./field-error') return {FieldError:'FieldError'};
    if (name==='./ui') return {ActionButton:'ActionButton'};
    if (name==='../dates') return require('../../.expo/finance-tests/dates.js');
    throw new Error(name);
  }};
  const source=ts.transpileModule(fs.readFileSync('src/features/finance/components/transaction-date-time.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,sandbox);
  const tree=sandbox.exports.TransactionDateTime({date:'2026-10-10',time:'14:35:37',disabled:false,onDateChange(){},onTimeChange:value=>changed.push(value)});
  const nodes=[]; function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node?.props)return;nodes.push(node);walk(node.props.children);}walk(tree);
  assert.ok(nodes.some(node=>node.type==='Text'&&node.props.children==='2:35 PM'));
  nodes.find(node=>node.props.accessibilityLabel==='Choose transaction time').props.onPress();
  assert.equal(opened.is24Hour,false);
  assert.equal(opened.display,'spinner');
  assert.equal(opened.timeZoneName,'Asia/Manila');
  opened.onValueChange(null,new Date('2026-10-10T06:35:00Z'));
  assert.deepEqual(changed,['14:35:37']);
});
