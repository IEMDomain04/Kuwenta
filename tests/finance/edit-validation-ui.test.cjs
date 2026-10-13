const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { cash, record } = require('./fixtures.cjs');
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness(file, { params = {}, accounts = [cash], transactions = [], goals = [], budgets = [], onSubmit = () => {} } = {}) {
  const hooks = []; let cursor = 0; const saved = [], prompts = [], notices = [];
  const finance = { accounts, transactions, goals, budgets, month: '2026-10', busy: false, lastEntryAccount: 'cash', showNotice: message => notices.push(message), newSubmissionId: async () => 'new-id', saveTransaction: async (...args) => saved.push(args), saveAccount: async (...args) => saved.push(args), saveGoal: async (...args) => saved.push(args), saveBudget: async (...args) => saved.push(args) };
  const state = initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }]; };
  const jsx = (type, props) => ({ type, props });
  const theme = { text: '#0A1129', border: '#73877A', accent: '#06633E', error: '#B4233C' };
  const sandbox = { Error, exports: {}, require(name) {
    if (name.endsWith('/peso-icon')) return { PesoIcon: 'PesoIcon' };
    if (name.endsWith('/account-icon')) return { AccountIcon: 'AccountIcon' };
    if (name.endsWith('/budget-period-picker')) return { BudgetPeriodPicker: 'BudgetPeriodPicker' };
    if (name === 'react') return { useMemo: fn => fn(), useState: state, useRef: value => state(() => ({ current: value }))[0], useEffect() {} };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react-native') return { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', Modal: 'Modal', TextInput: 'Input', KeyboardAvoidingView: 'AvoidingView', Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, useWindowDimensions: () => ({ height: 800, fontScale: 1 }) };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-router') return { useLocalSearchParams: () => params, router: { canGoBack: () => true, back() {}, replace() {} } };
    if (name === '@react-native-vector-icons/ionicons') return { Ionicons: 'Icon' };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-theme') return { useTheme: () => theme };
    if (name === '@/hooks/use-color-scheme') return { useColorScheme: () => 'light' };
    if (name === '../provider') return { useFinance: () => finance };
    if (name.endsWith('/confirmation')) return { useConfirmation: () => ({ alert: (...args) => prompts.push(args) }) };
    for (const [suffix, exported] of [['/field-error', 'FieldError'], ['/money-field', 'MoneyField'], ['/selection-sheet', 'SelectionSheet'], ['/quick-entry', 'QuickEntry'], ['/transaction-form', 'TransactionForm'], ['/transaction-date-time', 'TransactionDateTime']]) {
      if (name.endsWith(suffix)) return { [exported]: exported };
    }
    if (name.endsWith('/budget-list')) return { BudgetList: 'BudgetList' };
    if (name.endsWith('/budget-usage')) return { BudgetUsage: 'BudgetUsage' };
    if (name.endsWith('/home-month-picker')) return { HomeMonthPicker: 'MonthPicker' };
    if (name.endsWith('/ui')) return { ActionButton: 'Button', IconButton: 'IconButton', FinanceScreen: 'Screen', BackButton: 'Back' };
    if (name.endsWith('/category-visual')) return { CategoryIcon: 'CategoryIcon', categoryVisual: () => ({ color: '#06633E', icon: 'wallet-outline' }) };
    if (['../calculations', '../dates', '../inputs', '../money', '../types', '../validation', '../workflows', '../account-colors', '../budgets', '../account-icons', '../budget-periods', '../exchanges'].includes(name)) return require('../../.expo/finance-tests/' + name.slice(3) + '.js');
    throw new Error('Unexpected dependency: ' + name);
  } };
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0; const nodes = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; nodes.push(node); walk(node.props.children); if (node.type === 'BudgetList') node.props.rows.forEach(row => walk(node.props.renderRow(row))); walk(node.props.actions); walk(node.props.headerAccessory); }
    const component = sandbox.exports.default ?? sandbox.exports.AccountManager ?? sandbox.exports.TransactionForm;
    const props = file.includes('account-manager') ? { accountId: params.id, onClose() {} } : file.includes('transaction-form') ? { disabled: false, onSubmit, onCancel() {}, onTypeChange() {}, original: params.original, initialType: params.type, initialAccountId: params.accountId } : {};
    walk(component(props));
    return { nodes, find: type => nodes.find(node => node.type === type), button: label => nodes.find(node => node.props.label === label || node.props.accessibilityLabel === label), input: label => nodes.find(node => node.props.accessibilityLabel === label) };
  }
  return { render, saved, prompts, notices, theme };
}
test('editing a transaction saves directly and repeated taps submit once', async () => {
  const original = record();
  const h = harness('screens/transaction-screen.tsx', { params: { id: original.id }, transactions: [original] });
  const form = h.render().find('TransactionForm');
  const draft = { ...original, amount: 7500 };
  form.props.onSubmit(draft); form.props.onSubmit(draft);
  await settle();
  assert.equal(h.prompts.length, 0); assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0][0], original.id); assert.equal(h.saved[0][1].amount, 7500); assert.equal(h.saved[0][2], true);
});
test('routine account edits save directly, while a blank name is highlighted and never saved', async () => {
  const h = harness('components/account-manager.tsx', { params: { id: 'cash' } });
  h.render().input('Account name').props.onChangeText(' ');
  h.render().button('Save changes').props.onPress();
  assert.equal(h.saved.length, 0); assert.equal(h.prompts.length, 0);
  assert.equal(h.render().input('Account name').props.style[1].borderColor, h.theme.error);
  assert.ok(h.render().nodes.some(node => node.type === 'FieldError' && node.props.message === 'Enter an account name.'));
  h.render().input('Account name').props.onChangeText('My cash');
  assert.equal(h.render().input('Account name').props.style[1].borderColor, h.theme.border);
  h.render().button('Save changes').props.onPress(); await settle();
  assert.equal(h.saved.length, 1); assert.equal(h.saved[0][0].name, 'My cash'); assert.equal(h.prompts.length, 0);
});
test('goal edits save directly after validating name, dedicated account and amount', async () => {
  const account = { ...cash, id: 'savings', name: 'Savings', purpose: 'savings', includedInAvailable: false };
  const goal = { id: 'goal', name: 'Laptop', accountId: account.id, targetAmount: 500000, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
  const h = harness('screens/goal-screen.tsx', { params: { id: 'goal' }, accounts: [cash, account], goals: [goal] });
  h.render().input('Goal target amount in pesos').props.onValueChange('0');
  h.render().button('Save changes').props.onPress();
  assert.equal(h.saved.length, 0); assert.ok(h.render().nodes.some(node => node.type === 'FieldError' && node.props.message));
  h.render().input('Goal target amount in pesos').props.onValueChange('6000');
  h.render().button('Save changes').props.onPress(); await settle();
  assert.equal(h.prompts.length, 0); assert.equal(h.saved.length, 1); assert.equal(h.saved[0][0].targetAmount, 600000);
});
test('transaction fields highlight invalid amount and missing account, then allow a corrected draft', () => {
  const drafts = []; const h = harness('components/transaction-form.tsx', { onSubmit: draft => drafts.push(draft) });
  h.render().button('Save').props.onPress();
  assert.equal(drafts.length, 0);
  assert.ok(h.render().nodes.some(node => node.type === 'FieldError' && node.props.message));
  h.render().input('Amount in pesos').props.onValueChange('120.50');
  h.render().button('Save').props.onPress();
  assert.equal(drafts.length, 1); assert.equal(drafts[0].amount, 12050);
  const missing = harness('components/transaction-form.tsx', { accounts: [], onSubmit: () => assert.fail('No account must not submit') });
  missing.render().input('Amount in pesos').props.onValueChange('10');
  missing.render().button('Save').props.onPress();
  assert.ok(missing.render().nodes.some(node => node.type === 'FieldError' && node.props.message === 'Choose an active account.'));
});

test('budget changes show category and old/new limits; cancelling preserves the existing limit', async () => {
  const h = harness('screens/budgets-screen.tsx', { params: { scope: '2026-10' }, budgets: [{ month: '2026-10', category: 'Meals', limitAmount: 50000 }] });
  h.render().button('Edit Meals budget').props.onPress();
  h.render().input('Budget limit in pesos').props.onValueChange('650.25');
  const save = () => h.render().button('Save').props.onPress();
  save();
  assert.equal(h.saved.length, 0);
  assert.equal(h.prompts[0][3].rows[0].value, 'Meals');
  assert.match(h.prompts[0][3].change.before, /500.00/);
  assert.match(h.prompts[0][3].change.after, /650.25/);
  h.prompts[0][2].find(button => button.style === 'cancel').onPress();
  assert.equal(h.saved.length, 0);
  save(); h.prompts[1][2].find(button => button.text === 'Confirm').onPress();
  await settle();
  assert.equal(h.saved.length, 1); assert.equal(h.saved[0][0].limitAmount, 65025);
});


test('new budget period selection saves the selected date range and exact draft amount', async () => {
 const h=harness('screens/budgets-screen.tsx');
 h.render().button('Add').props.onPress();
 h.render().input('Budget limit in pesos').props.onValueChange('60.25');
 h.render().find('BudgetPeriodPicker').props.onPeriodChange('weekly');
 h.render().button('Save').props.onPress(); await settle();
 assert.equal(h.saved.length,1);
 assert.equal(h.saved[0][0].month,require('../../.expo/finance-tests/budget-periods.js').budgetPeriodKey('weekly',require('../../.expo/finance-tests/dates.js').philippineDateTime().transactionDate));
 assert.equal(h.saved[0][0].limitAmount,6025);
});


test('compact appearance dropdowns preserve selections in the account save and preview', async () => {
 const h=harness('components/account-manager.tsx',{params:{id:'cash'}});
 h.render().button('Select card color').props.onPress();
 let sheet=h.render().nodes.find(node=>node.type==='SelectionSheet'&&node.props.visible);
 assert.equal(sheet.props.title,'Card color');
 assert.ok(sheet.props.options.every(option=>option.value!=='default'));
 sheet.props.onSelect('indigo');sheet.props.onClose();
 h.render().button('Select account icon').props.onPress();
 sheet=h.render().nodes.find(node=>node.type==='SelectionSheet'&&node.props.visible);
 assert.equal(sheet.props.title,'Account icon');
 sheet.props.onSelect('maya');sheet.props.onClose();
 assert.ok(h.render().nodes.some(node=>node.type==='AccountIcon'&&node.props.account.icon==='maya'));
 h.render().button('Save changes').props.onPress();await settle();
 assert.equal(h.saved[0][0].color,'indigo');assert.equal(h.saved[0][0].icon,'maya');
});


test('Daily is the default, and an existing budget can change period without resetting its limit', async () => {
 const fresh=harness('screens/budgets-screen.tsx');
 assert.equal(fresh.render().find('BudgetPeriodPicker').props.period,'all');
 fresh.render().button('Add').props.onPress();
 assert.equal(fresh.render().find('BudgetPeriodPicker').props.period,'daily');
 const original={month:'2026-10',category:'Meals',limitAmount:50000};
 const h=harness('screens/budgets-screen.tsx',{params:{scope:'2026-10'},budgets:[original]});
 h.render().button('Edit Meals budget').props.onPress();
 assert.equal(h.render().find('BudgetPeriodPicker').props.disabled,false);
 h.render().find('BudgetPeriodPicker').props.onPeriodChange('weekly');
 assert.equal(h.render().input('Budget limit in pesos').props.value,'500.00');
 h.render().button('Save').props.onPress();
 assert.equal(h.prompts[0][3].change.label,'Budget period');
 h.prompts[0][2].find(button=>button.style==='cancel').onPress();
 assert.equal(h.saved.length,0);
 h.render().button('Save').props.onPress();
 h.prompts[1][2].find(button=>button.text==='Confirm').onPress();await settle();
 assert.equal(h.saved[0][0].month,require('../../.expo/finance-tests/budget-periods.js').budgetPeriodKey('weekly',require('../../.expo/finance-tests/dates.js').philippineDateTime().transactionDate));
 assert.equal(h.saved[0][0].limitAmount,50000);
 assert.equal(h.saved[0][2].month,'2026-10');
});


test('editing an older budget amount preserves its dates while All shows every scope',async()=>{
 const budgets=[{month:'2026-09',category:'Meals',limitAmount:50000},{month:'weekly:2026-09-07',category:'Drinks',limitAmount:5000},{month:'daily:2026-09-08',category:'Snacks',limitAmount:2000}];
 const h=harness('screens/budgets-screen.tsx',{budgets});
 assert.equal(h.render().nodes.filter(node=>node.type==='BudgetList').length,3);
 h.render().button('Edit Meals budget').props.onPress();
 assert.equal(h.render().find('BudgetPeriodPicker').props.date,'2026-09-01');
 assert.equal(h.render().find('BudgetPeriodPicker').props.onDateChange,undefined);
 h.render().input('Budget limit in pesos').props.onValueChange('600');
 h.render().button('Save').props.onPress();
 h.prompts[0][2].find(button=>button.text==='Confirm').onPress();await settle();
 assert.equal(h.saved[0][0].month,'2026-09');
});


test('service sale form submits both amounts and receipt clicks edit the linked parent',async()=>{
 const bank={...cash,id:'bank',name:'MariBank',openingBalance:500000};const accounts=[{...cash,openingBalance:500000},bank];let draft;
 const form=harness('components/transaction-form.tsx',{accounts,onSubmit:value=>{draft=value;}});
 form.render().button('Category: Meals. Change category.').props.onPress();
 form.render().button('Service sale').props.onPress();
 form.render().input('Amount paid in pesos').props.onValueChange('95');
 form.render().input('Amount received in pesos').props.onValueChange('100');
 form.render().button('Save').props.onPress();
 assert.equal(draft.exchange.paid,9500);assert.equal(draft.exchange.received,10000);
 const records=require('../../.expo/finance-tests/exchanges.js').exchangeRecords('sale',draft,'2026-10-13T04:00:00.000Z');
 const screen=harness('screens/transaction-screen.tsx',{params:{id:'sale:extra'},accounts,transactions:records});
 assert.equal(screen.render().find('TransactionForm').props.original.id,'sale');
 screen.render().find('TransactionForm').props.onSubmit(draft);
 assert.equal(screen.saved.length,0);
 screen.prompts[0][2].find(button=>button.style==='cancel').onPress();
 assert.equal(screen.saved.length,0);
 screen.render().find('TransactionForm').props.onSubmit(draft);
 screen.prompts[1][2].find(button=>button.text==='Save').onPress();await settle();
 assert.equal(screen.saved[0][0],'sale');assert.equal(screen.saved[0][2],true);
});


test('cash-in/out reuse the regular form and automatically allocate fees',()=>{
 const bank={...cash,id:'bank',name:'GCash',openingBalance:500000};const accounts=[{...cash,openingBalance:500000},bank];
 for(const [category,paid,received,extra] of [['Cash-in (E-bank)','2040','2000','cash'],['Cash-out (E-bank)','2000','40','bank']]){
  let draft;const h=harness('components/transaction-form.tsx',{accounts,onSubmit:value=>{draft=value;}});
  h.render().button('Category: Meals. Change category.').props.onPress();h.render().button(category).props.onPress();
  h.render().input('Amount paid in pesos').props.onValueChange(paid);
  h.render().input(category==='Cash-out (E-bank)'?'Fee in pesos':'Amount received in pesos').props.onValueChange(received);
  const fields=h.render().nodes;
  const incoming=fields.findIndex(node=>node.props.accessibilityLabel===(category==='Cash-out (E-bank)'?'Fee in pesos':'Amount received in pesos'));
  assert.ok(incoming<fields.findIndex(node=>node.props.accessibilityLabel==='Received into'));
  if(category==='Cash-out (E-bank)')assert.equal(h.render().input('Amount received in pesos'),undefined);
  assert.ok(h.render().find('TransactionDateTime'));
  assert.ok(h.render().input('Transaction notes'));
  assert.equal(h.render().button('Confirm difference is service earnings'),undefined);
  assert.equal(h.render().button('Fee paid from'),undefined);
  assert.equal(h.render().button('Use regular expense'),undefined);
  h.render().button('Save').props.onPress();
  assert.equal(draft.exchange.extraAccountId,extra);assert.equal(draft.exchange.earningsConfirmed,true);
 }
});

test('older exchange allocation survives unchanged edits and changes explicitly with the amounts',()=>{
 const accounts=[{...cash,openingBalance:500000},{...cash,id:'bank',name:'GCash',openingBalance:500000}];
 const api=require('../../.expo/finance-tests/exchanges.js');
 const draft=api.exchangeDraft('cash',{kind:'E-bank Cash-in',paid:200000,received:196000,receivedAccountId:'bank',extraAccountId:'bank',earningsConfirmed:false},'2026-10-13','12:00:00');
 const records=api.exchangeRecords('legacy',draft,'2026-10-13T04:00:00.000Z');let saved;
 const h=harness('components/transaction-form.tsx',{accounts,transactions:records,onSubmit:value=>{saved=value;},params:{original:records[0]}});
 h.render().button('Save changes').props.onPress();assert.equal(saved.exchange.extraAccountId,'bank');
 h.render().input('Amount paid in pesos').props.onValueChange('2010');
 assert.ok(h.render().nodes.some(node=>node.props.children==='Fee will be recorded in Cash.'));
 h.render().button('Save changes').props.onPress();assert.equal(saved.exchange.extraAccountId,'cash');
});


test('cash-out defaults to no fee, subtracts exact centavos and rejects fees that consume the amount',()=>{
 const accounts=[{...cash,openingBalance:500000},{...cash,id:'bank',name:'GCash',openingBalance:500000}];let saved;
 const h=harness('components/transaction-form.tsx',{accounts,onSubmit:value=>{saved=value;}});
 h.render().button('Category: Meals. Change category.').props.onPress();h.render().button('Cash-out (E-bank)').props.onPress();
 h.render().input('Amount paid in pesos').props.onValueChange('2000');h.render().button('Save').props.onPress();
 assert.equal(saved.exchange.received,200000);
 h.render().input('Fee in pesos').props.onValueChange('40.25');h.render().button('Save').props.onPress();
 assert.equal(saved.exchange.received,195975);assert.equal(saved.exchange.paid,200000);
 for(const invalid of ['2000','2001','-1','40.123']){
  saved=undefined;h.render().input('Fee in pesos').props.onValueChange(invalid);h.render().button('Save').props.onPress();
  assert.equal(saved,undefined);assert.ok(h.notices.length);
 }
});

test('cash-out edits derive the fee and retain older earnings records',()=>{
 const accounts=[{...cash,openingBalance:500000},{...cash,id:'bank',name:'GCash',openingBalance:500000}];
 const api=require('../../.expo/finance-tests/exchanges.js');
 for(const received of [196000,201000]){
  const draft=api.exchangeDraft('bank',{kind:'E-bank Cash-out',paid:200000,received,receivedAccountId:'cash',extraAccountId:received>200000?'cash':'bank',earningsConfirmed:true},'2026-10-13','12:00:00');
  const records=api.exchangeRecords('cashout',draft,'2026-10-13T04:00:00.000Z');let saved;
  const h=harness('components/transaction-form.tsx',{accounts,transactions:records,onSubmit:value=>{saved=value;},params:{original:records[0]}});
  if(received<200000)assert.equal(h.render().input('Fee in pesos').props.value,'40.00');
  else {assert.equal(h.render().input('Fee in pesos'),undefined);assert.equal(h.render().input('Amount received in pesos').props.value,'2010.00');}
  h.render().button('Save changes').props.onPress();assert.equal(saved.exchange.received,received);assert.equal(saved.exchange.paid,200000);
 }
});
