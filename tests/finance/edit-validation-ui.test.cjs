const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { cash, record } = require('./fixtures.cjs');
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness(file, { params = {}, accounts = [cash], transactions = [], goals = [], budgets = [], debts = [], debtPayments = [], debtAdditions = [], onSubmit = () => {}, deleteFailure = false, refreshRecords } = {}) {
  const hooks = []; let cursor = 0; const saved = [], prompts = [], notices = [], removed = [], navigation = [], effects = [], refreshed = [];
  const finance = { removeBudget: async (...args) => removed.push(args), removeGoal: async id => removed.push(id), debts, debtPayments, debtAdditions, addDebtAmount: async addition => saved.push(addition), correctDebtAmount: async (...args) => saved.push(args), removeDebtAddition: async id => removed.push(id), addDebt: async debt => saved.push(debt), payDebt: async payment => saved.push(payment), removeDebt: async (...args) => removed.push(args), saveExternal: async (...args) => saved.push(args), removeExternal: async id => { if (deleteFailure) throw new Error('Could not delete.'); removed.push(id); }, removeTransaction: async id => { if(deleteFailure)throw new Error('Could not delete.');removed.push(id); }, accounts, transactions, goals, budgets, month: '2026-10', busy: false, lastEntryAccount: 'cash', showNotice: message => notices.push(message), newSubmissionId: async () => 'new-id', saveTransaction: async (...args) => saved.push(args), saveAccount: async (...args) => saved.push(args), saveGoal: async (...args) => saved.push(args), saveBudget: async (...args) => saved.push(args) };
  finance.refresh = async () => { refreshed.push(true); refreshRecords?.(finance); };
  const state = initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }]; };
  const jsx = (type, props) => ({ type, props });
  const theme = { text: '#0A1129', border: '#73877A', accent: '#06633E', error: '#B4233C' };
  const sandbox = { Error, exports: {}, require(name) {
    if(name==='@/hooks/amount-visibility')return{useAmountVisibility:()=>({hidden:false,formatAmount:require('../../.expo/finance-tests/money.js').formatMoney,conceal:text=>text})};
    if (name.endsWith('/peso-icon')) return { PesoIcon: 'PesoIcon' };
    if (name.endsWith('/account-icon')) return { AccountIcon: 'AccountIcon' };
    if (name.endsWith('/budget-period-picker')) return { BudgetPeriodPicker: 'BudgetPeriodPicker' };
    if (name === 'react') return { useMemo: fn => fn(), useState: state, useRef: value => state(() => ({ current: value }))[0], useEffect(callback, dependencies) { if (refreshRecords && dependencies?.includes(finance.refresh)) effects.push(callback); } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react-native') return { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', Modal: 'Modal', TextInput: 'Input', KeyboardAvoidingView: 'AvoidingView', Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, useWindowDimensions: () => ({ height: 800, fontScale: 1 }) };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-router') return { useLocalSearchParams: () => params, router: { canGoBack: () => true, back() { navigation.push('back'); }, replace() { navigation.push('replace'); } } };
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
    if (['../calculations', '../dates', '../inputs', '../money', '../types', '../validation', '../workflows', '../account-colors', '../budgets', '../account-icons', '../budget-periods', '../exchanges', '../debts'].includes(name)) return require('../../.expo/finance-tests/' + name.slice(3) + '.js');
    throw new Error('Unexpected dependency: ' + name);
  } };
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0; const nodes = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; nodes.push(node); walk(node.props.children); if (node.type === 'BudgetList') node.props.rows.forEach(row => walk(node.props.renderRow(row))); walk(node.props.actions); walk(node.props.headerAccessory); }
    const component = sandbox.exports.default ?? sandbox.exports.AccountManager ?? sandbox.exports.TransactionForm;
    const props = file.includes('account-manager') ? { accountId: params.id, onClose() {} } : file.includes('transaction-form') ? { disabled: false, onSubmit, onCancel() {}, onTypeChange() {}, original: params.original, initialType: params.type, initialAccountId: params.accountId } : {};
    walk(component(props));
    effects.splice(0).forEach(callback => callback());
    return { nodes, find: type => nodes.find(node => node.type === type), button: label => nodes.find(node => node.props.label === label || node.props.accessibilityLabel === label), input: label => nodes.find(node => node.props.accessibilityLabel === label) };
  }
  return { render, saved, prompts, notices, theme, removed, navigation, refreshed };
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
 form.render().button('Service exchange').props.onPress();
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


test('transaction editor confirms deletion, cancels safely and deletes only once', async () => {
 const original=record();
 const h=harness('screens/transaction-screen.tsx',{params:{id:original.id},transactions:[original]});
 h.render().button('Delete transaction').props.onPress();h.render().button('Delete transaction').props.onPress();
 assert.equal(h.prompts.length,1);assert.equal(h.removed.length,0);
 assert.ok(h.prompts[0][3].rows.some(row=>row.label==='Amount' && row.value.includes('120')));
 h.prompts[0][2].find(button=>button.style==='cancel').onPress();assert.equal(h.removed.length,0);
 h.render().button('Delete transaction').props.onPress();
 const confirm=h.prompts[1][2].find(button=>button.style==='destructive');confirm.onPress();confirm.onPress();await settle();
 assert.deepEqual(h.removed,[original.id]);assert.deepEqual(h.navigation,['back']);
 assert.equal(harness('screens/transaction-screen.tsx').render().button('Delete transaction'),undefined);
});

test('transaction deletion failure keeps the editor available for retry',async()=>{
 const original=record();const h=harness('screens/transaction-screen.tsx',{params:{id:original.id},transactions:[original],deleteFailure:true});
 h.render().button('Delete transaction').props.onPress();h.prompts[0][2].find(button=>button.style==='destructive').onPress();await settle();
 assert.equal(h.removed.length,0);assert.equal(h.navigation.length,0);assert.ok(h.notices.includes('Could not delete.'));
 assert.equal(h.render().button('Delete transaction').props.disabled,false);
 h.render().button('Delete transaction').props.onPress();assert.equal(h.prompts.length,2);
});

test('opening a linked receipt deletes its exchange parent with both sides in the confirmation',async()=>{
 const bank={...cash,id:'bank',name:'MariBank'};const api=require('../../.expo/finance-tests/exchanges.js');
 const draft=api.exchangeDraft('bank',{kind:'Service sale',paid:9500,received:10000,receivedAccountId:'cash',extraAccountId:'cash',earningsConfirmed:true},'2026-10-13','12:00:00');
 const records=api.exchangeRecords('sale',draft,'2026-10-13T04:00:00.000Z');
 const h=harness('screens/transaction-screen.tsx',{params:{id:records[1].id},accounts:[cash,bank],transactions:records});
 h.render().button('Delete transaction').props.onPress();assert.equal(h.prompts[0][0],'Delete linked exchange?');
 assert.ok(h.prompts[0][3].rows.some(row=>row.label==='Paid from' && row.value.includes('MariBank')));
 assert.ok(h.prompts[0][3].rows.some(row=>row.label==='Received into' && row.value.includes('Cash')));
 h.prompts[0][2].find(button=>button.style==='destructive').onPress();await settle();assert.deepEqual(h.removed,['sale']);
});


test('editing account balance confirms old and new values and saves details with one correction',async()=>{
 const h=harness('components/account-manager.tsx',{params:{id:'cash'},transactions:[record()]});
 assert.equal(h.render().input('Account current balance in pesos').props.value,'880.00');
 assert.equal(h.render().input('Account opening balance in pesos'),undefined);
 h.render().input('Account name').props.onChangeText('My cash');
 h.render().input('Account current balance in pesos').props.onValueChange('500');
 h.render().button('Save changes').props.onPress();assert.equal(h.saved.length,0);
 assert.ok(h.prompts[0][3].change.before.includes('880.00'));assert.ok(h.prompts[0][3].change.after.includes('500.00'));
 h.prompts[0][2].find(button=>button.style==='cancel').onPress();assert.equal(h.saved.length,0);
 h.render().button('Save changes').props.onPress();h.prompts[1][2].find(button=>button.text==='Confirm').onPress();await settle();
 assert.equal(h.saved.length,1);assert.equal(h.saved[0][0].openingBalance,100000);assert.equal(h.saved[0][0].name,'My cash');
 assert.equal(h.saved[0][2].target,50000);assert.equal(h.saved[0][2].expected,88000);
});


test('transaction editing reloads a stale snapshot before showing unavailable and retries genuinely missing records',()=>{
 const original=record();
 const h=harness('screens/transaction-screen.tsx',{params:{id:original.id},refreshRecords:finance=>finance.transactions.push(original)});
 assert.equal(h.render().find('Screen').props.title,'Opening transaction');
 assert.equal(h.render().find('TransactionForm').props.original.id,original.id);assert.equal(h.refreshed.length,1);
 const missing=harness('screens/transaction-screen.tsx',{params:{id:'missing'},refreshRecords:()=>{}});
 missing.render();assert.equal(missing.render().find('Screen').props.title,'Transaction unavailable');
 missing.render().button('Retry').props.onPress();missing.render();assert.equal(missing.refreshed.length,2);
});

test('a removed equal-exchange child ID opens its surviving parent after an update',()=>{
 const bank={...cash,id:'bank',name:'MariBank'};const api=require('../../.expo/finance-tests/exchanges.js');
 const draft=api.exchangeDraft('bank',{kind:'Service sale',paid:10000,received:10000,receivedAccountId:'cash',extraAccountId:'cash',earningsConfirmed:true},'2026-10-13','12:00:00');
 const records=api.exchangeRecords('equal',draft,'2026-10-13T04:00:00.000Z');
 const h=harness('screens/transaction-screen.tsx',{params:{id:['equal:extra']},accounts:[cash,bank],transactions:records});
 assert.equal(h.render().find('TransactionForm').props.original.id,'equal');
});


test('external editor prefills values and previews replacement instead of adding the original twice', async () => {
  const original = record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'increase', amount: 10000, notes: 'Cash received' });
  const h = harness('screens/transfer-screen.tsx', { params: { id: original.id }, transactions: [original] });
  assert.equal(h.render().input('External source name').props.value, 'Friend');
  assert.equal(h.render().input('Transfer amount').props.value, '100.00');
  h.render().input('Transfer amount').props.onValueChange('200.00');
  const { formatMoney } = require('../../.expo/finance-tests/money.js');
  assert.ok(h.render().nodes.some(node => Array.isArray(node.props.children) && node.props.children.includes(formatMoney(120000))));
  h.render().button('Save changes').props.onPress();
  const prompt = h.prompts.at(-1); prompt[2].find(button => button.text === 'Save').onPress(); prompt[2].find(button => button.text === 'Save').onPress(); await settle();
  assert.equal(h.saved.length, 1); assert.equal(h.saved[0][0].id, original.id); assert.equal(h.saved[0][0].amount, 20000); assert.equal(h.saved[0][0].createdAt, original.createdAt); assert.equal(h.saved[0][1], true);
});
test('external editor changes direction and account without changing its record type', async () => {
  const original = record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'increase', amount: 10000 });
  const bank = { ...cash, id: 'bank', name: 'Bank', openingBalance: 50000 };
  const h = harness('screens/transfer-screen.tsx', { params: { id: original.id }, accounts: [cash, bank], transactions: [original] });
  h.render().button('Money out').props.onPress();
  h.render().input('Choose from').props.onPress(); h.render().find('SelectionSheet').props.onSelect('bank');
  h.render().button('Save changes').props.onPress(); h.prompts.at(-1)[2].find(button => button.text === 'Save').onPress(); await settle();
  assert.equal(h.saved[0][0].type, 'EXTERNAL'); assert.equal(h.saved[0][0].adjustmentDirection, 'decrease'); assert.equal(h.saved[0][0].accountId, 'bank');
});
test('external deletion shows the reverted balance, cancels safely, and submits only once', async () => {
  for (const direction of ['increase', 'decrease']) {
    const original = record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: direction, amount: 10000 });
    const h = harness('screens/transfer-screen.tsx', { params: { id: original.id }, transactions: [original] });
    h.render().button('Delete movement').props.onPress();
    const { formatMoney } = require('../../.expo/finance-tests/money.js');
    assert.equal(h.prompts.at(-1)[3].rows.find(row => row.label === 'Balance after deletion').value, formatMoney(cash.openingBalance));
    h.prompts.at(-1)[2].find(button => button.text === 'Cancel').onPress(); assert.equal(h.removed.length, 0);
    h.render().button('Delete movement').props.onPress(); const button = h.prompts.at(-1)[2].find(button => button.text === 'Delete');
    assert.equal(button.style, 'destructive'); button.onPress(); button.onPress(); await settle(); assert.deepEqual(h.removed, [original.id]);
  }
});
test('archived external movements can be deleted but cannot be edited; failed deletion leaves a retry', async () => {
  const original = record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'decrease' });
  const h = harness('screens/transfer-screen.tsx', { params: { id: original.id }, accounts: [{ ...cash, archived: true }], transactions: [original], deleteFailure: true });
  assert.equal(h.render().button('Save changes').props.disabled, true); assert.equal(h.render().input('Transfer amount').props.editable, false);
  assert.equal(h.render().button('Delete movement').props.disabled, false);
  h.render().button('Delete movement').props.onPress(); h.prompts.at(-1)[2].find(button => button.text === 'Delete').onPress(); await settle();
  assert.ok(h.notices.includes('Could not delete.')); assert.equal(h.render().button('Delete movement').props.disabled, false);
});
test('a stale external movement reloads before editing and a missing record cannot be saved as new', async () => {
  const original = record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'increase' });
  const h = harness('screens/transfer-screen.tsx', { params: { id: original.id }, refreshRecords: finance => { finance.transactions = [original]; } });
  h.render(); await settle(); h.render();
  assert.equal(h.render().input('Transfer amount').props.value, '120.00');
  const missing = harness('screens/transfer-screen.tsx', { params: { id: 'missing' }, refreshRecords: () => {} });
  missing.render(); await settle(); assert.equal(missing.render().button('Save changes'), undefined);
});


test('new normal transfers and new external movements keep their existing create flows', async () => {
  const bank = { ...cash, id: 'bank', name: 'Bank', openingBalance: 0 };
  const h = harness('screens/transfer-screen.tsx', { params: { accountId: 'cash', destinationAccountId: 'bank' }, accounts: [cash, bank] });
  h.render().input('Transfer amount').props.onValueChange('100.00'); h.render().button('Save transfer').props.onPress();
  h.prompts.at(-1)[2].find(button => button.text === 'Save').onPress(); await settle();
  assert.equal(h.saved[0][1].type, 'TRANSFER'); assert.equal(h.saved[0][2], false);
  const external = harness('screens/transfer-screen.tsx', { params: { destinationAccountId: 'cash' } });
  external.render().input('Choose from').props.onPress(); external.render().find('SelectionSheet').props.onSelect('external');
  external.render().input('External source name').props.onChangeText('Friend'); external.render().input('Transfer amount').props.onValueChange('50.00');
  external.render().button('Save transfer').props.onPress(); external.prompts.at(-1)[2].find(button => button.text === 'Save').onPress(); await settle();
  assert.equal(external.saved[0][0].id, 'new-id'); assert.equal(external.saved[0][0].type, 'EXTERNAL'); assert.equal(external.saved[0][1], false);
});


test('new budgets can select overall spending using the existing picker', async () => {
  const h = harness('screens/budgets-screen.tsx');
  h.render().button('Add').props.onPress();
  h.render().button('Budget category').props.onPress();
  const picker = h.render().find('SelectionSheet');
  assert.ok(picker.props.options.some(option => option.value === 'Overall spending'));
  picker.props.onSelect('Overall spending');
  h.render().input('Budget limit in pesos').props.onValueChange('500');
  h.render().button('Save').props.onPress(); await settle();
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0][0].category, 'Overall spending');
  assert.equal(h.saved[0][0].limitAmount, 50000);
});

test('overall budget has edit actions separately from the category list', async () => {
  const budgets = [{ month: '2026-10', category: 'Overall spending', limitAmount: 50000 }, { month: '2026-10', category: 'Meals', limitAmount: 15000 }];
  const h = harness('screens/budgets-screen.tsx', { budgets });
  assert.deepEqual(h.render().find('BudgetList').props.rows.map(row => row.category), ['Meals']);
  h.render().button('Edit Overall spending budget').props.onPress();
  h.render().input('Budget limit in pesos').props.onValueChange('600');
  h.render().button('Save').props.onPress();
  assert.equal(h.prompts.length, 1);
  h.prompts[0][2].find(button => button.text === 'Confirm').onPress(); await settle();
  assert.equal(h.saved[0][0].category, 'Overall spending');
  assert.equal(h.saved[0][0].limitAmount, 60000);
});


test('new debts validate fields, select an account, save exact centavos and prevent repeated submissions',async()=>{
 const h=harness('screens/debt-screen.tsx');
 h.render().button('Save debt').props.onPress();
 assert.equal(h.saved.length,0);assert.ok(h.render().nodes.some(node=>node.props.message==="Enter the person's name."));
 h.render().input('Person name').props.onChangeText('Classmate');
 h.render().input('Debt amount').props.onValueChange('500.25');
 h.render().find('SelectionSheet').props.onSelect('cash');
 h.render().button('Owed to me').props.onPress();
 assert.equal(h.render().input('Debt due date'),undefined);
 h.render().input('Debt note').props.onChangeText('Pay back next Friday');
 const save=h.render().button('Save debt');save.props.onPress();save.props.onPress();await settle();
 assert.equal(h.saved.length,1);assert.equal(h.saved[0].id,'new-id');assert.equal(h.saved[0].amount,50025);assert.equal(h.saved[0].kind,'owed');assert.equal(h.saved[0].name,'Classmate');assert.equal(h.saved[0].dueDate,undefined);assert.equal(h.saved[0].notes,'Pay back next Friday');
});

test('repayments cannot exceed the remaining amount and keep the chosen account and note',async()=>{
 const date=require('../../.expo/finance-tests/dates.js').philippineDateTime();
 const debt={id:'loan',name:'Friend',kind:'owed',amount:50000,accountId:'cash',transactionDate:'2020-01-01',transactionTime:'00:00:00',createdAt:'2020-01-01T00:00:00.000Z',updatedAt:'2020-01-01T00:00:00.000Z'};
 const h=harness('screens/debt-screen.tsx',{params:{id:'loan'},debts:[debt],debtPayments:[{id:'old',debtId:'loan',amount:20000,accountId:'cash',...date,createdAt:'2026-10-19T00:00:00.000Z'}]});
 h.render().input('Repayment amount').props.onValueChange('300.01');h.render().find('SelectionSheet').props.onSelect('cash');
 h.render().button('Save repayment').props.onPress();assert.equal(h.saved.length,0);
 assert.ok(h.render().nodes.some(node=>node.props.message==='Repayment cannot exceed the remaining debt.'));
 h.render().input('Repayment amount').props.onValueChange('300');h.render().input('Debt note').props.onChangeText('Returned cash');
 h.render().button('Save repayment').props.onPress();await settle();
 assert.equal(h.saved.length,1);assert.equal(h.saved[0].amount,30000);assert.equal(h.saved[0].debtId,'loan');assert.equal(h.saved[0].notes,'Returned cash');
});

test('debt and repayment deletion require confirmation and submit once; missing debts never become new entries',async()=>{
 const debt={id:'loan',name:'Friend',kind:'owe',amount:50000,accountId:'cash',transactionDate:'2020-01-01',transactionTime:'00:00:00',createdAt:'2020-01-01T00:00:00.000Z',updatedAt:'2020-01-01T00:00:00.000Z'};
 const h=harness('screens/debt-screen.tsx',{params:{id:'loan'},debts:[debt]});
 h.render().button('Delete debt').props.onPress();h.prompts[0][2].find(button=>button.style==='cancel').onPress();assert.equal(h.removed.length,0);
 h.render().button('Delete debt').props.onPress();const confirm=h.prompts[1][2].find(button=>button.text==='Delete');confirm.onPress();confirm.onPress();await settle();
 assert.equal(h.removed.length,1);assert.deepEqual(h.removed[0],['loan',false]);
 const missing=harness('screens/debt-screen.tsx',{params:{id:'missing'}});assert.equal(missing.render().button('Save debt'),undefined);
});


test('existing debt entry requires no account and records the amount still owed without a balance preview',async()=>{
 const h=harness('screens/debt-screen.tsx');
 const initial=h.render();assert.ok(initial.nodes.indexOf(initial.input('Person name'))<initial.nodes.indexOf(initial.button('When did this happen?')));
 assert.ok(initial.nodes.some(node=>node.props.children==='Just now'));
 h.render().button('When did this happen?').props.onPress();h.render().nodes.find(node=>node.type==='SelectionSheet'&&node.props.title==='When did this happen?').props.onSelect('existing');
 h.render().input('Person name').props.onChangeText('Classmate');
 h.render().input('Debt amount').props.onValueChange('300');
 h.render().input('Debt note').props.onChangeText('Unpaid from last week');
 assert.ok(h.render().nodes.some(node=>node.props.children==='Track the debt without changing my balance.'));
 assert.equal(h.render().button('Debt account'),undefined);
 assert.ok(!h.render().nodes.some(node=>typeof node.props.children==='string'&&node.props.children.includes('Principal')));
 h.render().button('Save debt').props.onPress();await settle();
 assert.equal(h.saved.length,1);assert.equal(h.saved[0].existing,true);assert.equal(h.saved[0].accountId,undefined);assert.equal(h.saved[0].amount,30000);
});

test('switching back to Just now requires an account and keeps the original balance-changing flow',async()=>{
 const h=harness('screens/debt-screen.tsx');
 h.render().button('When did this happen?').props.onPress();h.render().nodes.find(node=>node.type==='SelectionSheet'&&node.props.title==='When did this happen?').props.onSelect('existing');h.render().button('When did this happen?').props.onPress();h.render().nodes.find(node=>node.type==='SelectionSheet'&&node.props.title==='When did this happen?').props.onSelect('new');
 h.render().input('Person name').props.onChangeText('Friend');h.render().input('Debt amount').props.onValueChange('100');
 h.render().button('Save debt').props.onPress();assert.equal(h.saved.length,0);
 assert.ok(h.render().nodes.some(node=>node.props.message==='Choose an active account.'));
 h.render().find('SelectionSheet').props.onSelect('cash');h.render().button('Save debt').props.onPress();await settle();
 assert.equal(h.saved.length,1);assert.equal(h.saved[0].existing,undefined);assert.equal(h.saved[0].accountId,'cash');
});


test('new and edited exchange previews retain account history and match saved exchange amounts', () => {
  const api = require('../../.expo/finance-tests/exchanges.js');
  const { calculateAccountSummary } = require('../../.expo/finance-tests/calculations.js');
  const { formatMoney } = require('../../.expo/finance-tests/money.js');
  const accounts = [{ ...cash, openingBalance: 100000 }, { ...cash, id: 'bank', name: 'MariBank', openingBalance: 1009500 }];
  const stamp = '2026-10-13T04:00:00.000Z';
  const draftFor = (kind, paid, received) => api.exchangeDraft('bank', { kind, paid, received, receivedAccountId: 'cash', extraAccountId: received > paid ? 'cash' : 'bank', earningsConfirmed: true }, '2026-10-13', '12:00:00');
  const history = [record({ id: 'bank-expense', accountId: 'bank', amount: 400000 }), record({ id: 'cash-expense', amount: 10000 }), ...api.exchangeRecords('previous', draftFor('Service sale', 9500, 10000), stamp)];
  assert.equal(calculateAccountSummary(accounts[1], history, '2026-10').balance, 600000);
  for (const [category, kind, paid, received] of [
    ['Service exchange', 'Service sale', 14850, 15000],
    ['Service exchange', 'Service sale', 15000, 15000],
    ['Service exchange', 'Service sale', 15000, 14850],
    ['Cash-in (E-bank)', 'E-bank Cash-in', 104000, 100000],
    ['Cash-out (E-bank)', 'E-bank Cash-out', 100000, 98000],
  ]) for (const editing of [false, true]) {
    const previous = editing ? api.exchangeRecords('editing', draftFor(kind, 20000, 19000), stamp) : [];
    let saved;
    const h = harness('components/transaction-form.tsx', { accounts, transactions: [...history, ...previous], params: { original: previous[0], accountId: 'bank' }, onSubmit: value => { saved = value; } });
    if (!editing) {
      h.render().button('Category: Meals. Change category.').props.onPress();
      h.render().button(category).props.onPress();
      h.render().nodes.find(node => node.props.accessibilityLabel?.startsWith('Paid from, ')).props.onPress();
      h.render().button('MariBank').props.onPress();
      h.render().button('Received into').props.onPress(); h.render().button('Cash').props.onPress();
    }
    h.render().input('Amount paid in pesos').props.onValueChange(String(paid / 100));
    h.render().input(kind === 'E-bank Cash-out' ? 'Fee in pesos' : 'Amount received in pesos').props.onValueChange(String((kind === 'E-bank Cash-out' ? paid - received : received) / 100));
    const text = h.render().nodes.filter(node => node.type === 'Text').map(node => [].concat(node.props.children).join(''));
    assert.ok(text.includes('MariBank: ' + formatMoney(600000 - paid)), category + ' source preview, editing=' + editing);
    assert.ok(text.includes('Cash: ' + formatMoney(100000 + received)), category + ' destination preview, editing=' + editing);
    h.render().button(editing ? 'Save changes' : 'Save').props.onPress();
    assert.ok(saved);
    const records = [...history, ...api.exchangeRecords('saved', saved, stamp)];
    assert.equal(calculateAccountSummary(accounts[1], records, '2026-10').balance, 600000 - paid);
    assert.equal(calculateAccountSummary(accounts[0], records, '2026-10').balance, 100000 + received);
  }
});

const editableDebt={id:'loan',name:'Ana',kind:'owed',amount:50000,accountId:'cash',transactionDate:'2020-01-01',transactionTime:'00:00:00',createdAt:'2020-01-01T00:00:00.000Z',updatedAt:'2020-01-01T00:00:00.000Z'};

test('additional borrowing uses the existing debt form and saves only the added amount once',async()=>{
 const h=harness('screens/debt-screen.tsx',{params:{id:'loan'},debts:[editableDebt],debtPayments:[{id:'paid',debtId:'loan',amount:20000,transactionDate:'2020-01-02',transactionTime:'10:00:00',accountId:'cash'}]});
 h.render().button('Add borrowed amount').props.onPress();
 assert.equal(h.render().input('Repayment amount'),undefined);
 h.render().input('Additional borrowed amount').props.onValueChange('150');h.render().find('SelectionSheet').props.onSelect('cash');
 const save=h.render().button('Save borrowing');save.props.onPress();save.props.onPress();await settle();
 assert.equal(h.saved.length,1);assert.equal(h.saved[0].amount,15000);assert.equal(h.saved[0].debtId,'loan');assert.equal(h.saved[0].accountId,'cash');
});

test('settled debt allows tracking earlier additional borrowing without an account',async()=>{
 const h=harness('screens/debt-screen.tsx',{params:{id:'loan'},debts:[editableDebt],debtPayments:[{id:'paid',debtId:'loan',amount:50000,transactionDate:'2020-01-02',transactionTime:'10:00:00',accountId:'cash'}]});
 assert.equal(h.render().button('Save repayment'),undefined);h.render().button('Add borrowed amount').props.onPress();
 h.render().nodes.find(node=>node.type==='SelectionSheet'&&node.props.title==='When did this happen?').props.onSelect('existing');
 h.render().input('Additional borrowed amount').props.onValueChange('150');assert.equal(h.render().button('Debt account'),undefined);
 h.render().button('Save borrowing').props.onPress();await settle();assert.equal(h.saved.length,1);assert.equal(h.saved[0].existing,true);assert.equal(h.saved[0].accountId,undefined);
});

test('original amount correction confirms old and new amounts and cancellation keeps history intact',async()=>{
 const h=harness('screens/debt-screen.tsx',{params:{id:'loan'},debts:[editableDebt],debtPayments:[{id:'paid',debtId:'loan',amount:20000,transactionDate:'2020-01-02',transactionTime:'10:00:00',accountId:'cash'}]});
 h.render().button('Edit original amount').props.onPress();assert.equal(h.render().input('Original amount').props.value,'500.00');
 assert.equal(h.render().find('TransactionDateTime'),undefined);assert.equal(h.render().button('Debt account'),undefined);
 h.render().input('Original amount').props.onValueChange('100');h.render().button('Save correction').props.onPress();assert.equal(h.prompts.length,0);
 h.render().input('Original amount').props.onValueChange('600');h.render().button('Save correction').props.onPress();
 assert.match(h.prompts[0][3].change.before,/500.00/);assert.match(h.prompts[0][3].change.after,/600.00/);
 h.prompts[0][2].find(button=>button.style==='cancel').onPress();assert.equal(h.saved.length,0);
 h.render().button('Save correction').props.onPress();const confirm=h.prompts[1][2].find(button=>button.text==='Confirm');confirm.onPress();confirm.onPress();await settle();
 assert.equal(h.saved.length,1);assert.deepEqual(h.saved[0],['loan',60000,50000]);
});


test('editing legacy income shows one current category choice and keeps the amount',()=>{
 for(const [old,current] of [['Gift','Gifts'],['Other','Other Income']]) {
  const original=record({type:'INCOME',category:old,amount:50000});let saved;
  const h=harness('components/transaction-form.tsx',{params:{original,type:'INCOME'},onSubmit:row=>{saved=row;}});
  h.render().button('Category: '+current+'. Change category.').props.onPress();
  assert.equal(h.render().nodes.filter(node=>node.props.accessibilityLabel===current).length,1);
  assert.equal(h.render().button(old),undefined);
  h.render().button(current).props.onPress();h.render().button('Save changes').props.onPress();
  assert.equal(saved.category,current);assert.equal(saved.amount,50000);assert.equal(original.category,old);
 }
});


test('saved transaction, goal, debt and external-movement trash actions live only in the editor header', () => {
  const goal = { id: 'goal', name: 'Laptop', accountId: 'cash', targetAmount: 500000, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
  const debt = { id: 'debt', name: 'Friend', kind: 'owed', amount: 10000, existing: true, transactionDate: '2026-10-01', transactionTime: '12:00:00', createdAt: '2026-10-01T04:00:00.000Z', updatedAt: '2026-10-01T04:00:00.000Z' };
  const external = record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'increase' });
  for (const [file, options, label] of [
    ['transaction', { params: { id: 'expense-1' }, transactions: [record()] }, 'Delete transaction'],
    ['goal', { params: { id: goal.id }, goals: [goal] }, 'Delete goal'],
    ['debt', { params: { id: debt.id }, debts: [debt] }, 'Delete debt'],
    ['transfer', { params: { id: external.id }, transactions: [external] }, 'Delete movement'],
  ]) {
    const path = 'screens/' + file + '-screen.tsx';
    const rendered = harness(path, options).render();
    const trash = rendered.find('Screen').props.headerAccessory;
    assert.equal(trash.props.label, label);
    assert.equal(trash.props.destructive, true);
    assert.equal(rendered.nodes.filter(node => node.props.label === label || node.props.accessibilityLabel === label).length, 1);
    assert.equal(harness(path).render().button(label), undefined);
    assert.equal(harness(path, { params: { id: 'missing' } }).render().button(label), undefined);
  }
});

test('budget editor header deletes the saved budget, even when an unsaved period change is present', async () => {
  const budget = { month: '2026-10', category: 'Meals', limitAmount: 10000 };
  const h = harness('screens/budgets-screen.tsx', { budgets: [budget] });
  assert.equal(h.render().button('Delete Meals budget'), undefined);
  h.render().button('Edit Meals budget').props.onPress();
  let rendered = h.render();
  const accessory = rendered.find('Screen').props.headerAccessory;
  assert.ok(accessory.props.children.some(node => node?.props?.label === 'Delete Meals budget'));
  assert.equal(rendered.nodes.filter(node => node.props.label === 'Delete Meals budget').length, 1);
  rendered.find('BudgetPeriodPicker').props.onPeriodChange('weekly');
  h.render().button('Delete Meals budget').props.onPress();
  assert.equal(h.prompts[0][0], 'Delete budget?');
  assert.ok(h.prompts[0][1].includes('expenses are kept'));
  h.prompts[0][2].find(button => button.style === 'cancel').onPress();
  assert.equal(h.removed.length, 0);
  h.render().button('Delete Meals budget').props.onPress();
  h.prompts[1][2].find(button => button.style === 'destructive').onPress();
  await settle();
  assert.deepEqual(h.removed, [['2026-10', 'Meals']]);
  assert.equal(harness('screens/budgets-screen.tsx').render().button('Delete Meals budget'), undefined);
});
