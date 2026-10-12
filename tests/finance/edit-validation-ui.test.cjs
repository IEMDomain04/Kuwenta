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
    if (name === 'react') return { useState: state, useRef: value => state(() => ({ current: value }))[0], useEffect() {} };
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
    if (name.endsWith('/budget-usage')) return { BudgetUsage: 'BudgetUsage' };
    if (name.endsWith('/home-month-picker')) return { HomeMonthPicker: 'MonthPicker' };
    if (name.endsWith('/ui')) return { ActionButton: 'Button', IconButton: 'IconButton', FinanceScreen: 'Screen', BackButton: 'Back' };
    if (name.endsWith('/category-visual')) return { CategoryIcon: 'CategoryIcon', categoryVisual: () => ({ color: '#06633E', icon: 'wallet-outline' }) };
    if (['../calculations', '../dates', '../inputs', '../money', '../types', '../validation', '../workflows', '../account-colors', '../budgets'].includes(name)) return require('../../.expo/finance-tests/' + name.slice(3) + '.js');
    throw new Error('Unexpected dependency: ' + name);
  } };
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0; const nodes = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; nodes.push(node); walk(node.props.children); walk(node.props.actions); }
    const component = sandbox.exports.default ?? sandbox.exports.AccountManager ?? sandbox.exports.TransactionForm;
    const props = file.includes('account-manager') ? { accountId: params.id, onClose() {} } : file.includes('transaction-form') ? { disabled: false, onSubmit, onCancel() {}, onTypeChange() {}, initialType: params.type, initialAccountId: params.accountId } : {};
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
  const h = harness('screens/budgets-screen.tsx', { budgets: [{ month: '2026-10', category: 'Meals', limitAmount: 50000 }] });
  h.render().button('Edit Meals budget').props.onPress();
  h.render().input('Monthly budget limit in pesos').props.onValueChange('650.25');
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
