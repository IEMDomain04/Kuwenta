const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
const { cash, record } = require('./fixtures.cjs');
const source = ts.transpileModule(fs.readFileSync('src/features/finance/screens/account-screen.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness({ id = 'bank', archived = false } = {}) {
  const hooks = []; let cursor = 0, confirmation;
  const removed = [], saved = [], adjusted = [];
  const accounts = [cash, { ...cash, id: 'bank', name: 'Bank', purpose: 'savings', includedInAvailable: false, openingBalance: 50000, archived }];
  const finance = {
    accounts, transactions: [record({ accountId: 'bank' }), record({ id: 'transfer', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 10000 })],
    goals: [{ id: 'goal', name: 'Emergency', accountId: 'bank' }], month: '2026-10', busy: false, showNotice() {},
    newSubmissionId: async () => 'adjustment-id',
    adjustBalance: async (...args) => adjusted.push(args),
    removeAccount: async accountId => removed.push(accountId),
    saveAccount: async account => { saved.push(account); accounts[accounts.findIndex(row => row.id === account.id)] = account; },
  };
  const state = initial => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks[index], value => { hooks[index] = value; }];
  };
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react') return { useState: state, useRef: value => state(() => ({ current: value }))[0], useEffect() {} };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === '../components/confirmation') return { useConfirmation: () => ({ alert: (title, message, buttons, options) => { confirmation = { title, message, buttons, options }; } }) };
    if (name.endsWith('/field-error')) return { FieldError: 'FieldError' };
    if (name === 'react-native') return { View: 'View', Modal: 'Modal', Pressable: 'Pressable', TextInput: 'Input', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' } };
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ id }), router: { canGoBack: () => true, back() {}, push() {}, replace() {} } };
    if (name === '@react-native-vector-icons/ionicons') return { Ionicons: 'Icon' };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({ accent: '#06633E', border: '#73877A' }) };
    if (name === '../provider') return { useFinance: () => finance };
    if (name === '../components/account-manager') return { AccountManager: 'AccountManager' };
    if (name === '../components/money-field') return { MoneyField: 'MoneyField' };
    if (name === '../components/ui') return { ActionButton: 'Button', FinanceScreen: 'Screen', BackButton: 'BackButton', TransactionRow: 'TransactionRow' };
    if (['../calculations', '../dates', '../inputs', '../money'].includes(name)) return require('../../.expo/finance-tests/' + name.slice(3) + '.js');
    throw new Error('Unexpected dependency: ' + name);
  } };
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0; const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || !node.props) return;
      nodes.push(node); walk(node.props.children);
    }
    walk(sandbox.exports.default());
    return nodes;
  }
  function option(label) { return render().find(node => node.type === 'Text' && node.props.children === label); }
  function pressOption(label) {
    const text = option(label);
    const button = render().find(node => node.type === 'Pressable' && Array.isArray(node.props.children) && node.props.children.some(child => child?.type === 'Text' && child.props.children === text.props.children));
    return button.props;
  }
  return { render, pressOption, removed, saved, adjusted, confirmation: () => confirmation };
}

test('active and archived account deletion requires confirmation with records, goal and transfer impact', async () => {
  for (const archived of [false, true]) {
    const h = harness({ archived });
    const deletion = h.pressOption('Delete account');
    assert.equal(deletion.disabled, false);
    deletion.onPress();
    assert.equal(h.removed.length, 0);
    const confirmation = h.confirmation();
    assert.match(confirmation.message, /48(?:0|0.00)/);
    assert.match(confirmation.message, /2 related records/);
    assert.match(confirmation.message, /Emergency.*deleted/);
    assert.match(confirmation.message, /Balances may change in: Cash/);
    confirmation.buttons.find(button => button.text === 'Cancel').onPress();
    assert.equal(h.removed.length, 0);
    h.pressOption('Delete account').onPress();
    h.confirmation().buttons.find(button => button.text === 'Delete').onPress();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(h.removed, ['bank']);
  }
  assert.equal(harness({ id: 'cash' }).pressOption('Delete account').disabled, true);
});

test('archive and unarchive remain available and never invoke permanent deletion', async () => {
  const h = harness();
  h.pressOption('Archive account').onPress();
  h.confirmation().buttons.find(button => button.text === 'Archive').onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.saved.at(-1).archived, true);
  h.pressOption('Unarchive account').onPress();
  h.confirmation().buttons.find(button => button.text === 'Unarchive').onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.saved.at(-1).archived, false);
  assert.deepEqual(h.removed, []);
});

test('Adjust balance has a border and no icon, while the adjustment screen has no sign toggle or options icon', () => {
  const h = harness();
  const adjust = h.render().find(node => node.props.label === 'Adjust balance');
  assert.equal(adjust.props.bordered, true);
  assert.equal(adjust.props.icon, undefined);
  adjust.props.onPress();
  const nodes = h.render();
  assert.ok(nodes.some(node => node.type === 'MoneyField'));
  assert.ok(nodes.every(node => node.props.accessibilityLabel !== 'Account options'));
  assert.ok(nodes.every(node => !['Make negative', 'Make positive'].includes(node.props.label)));
});

test('balance adjustment previews current and new amounts and only commits after confirmation', async () => {
  const h = harness();
  h.render().find(node => node.props.label === 'Adjust balance').props.onPress();
  h.render().find(node => node.type === 'MoneyField').props.onValueChange('300.50');
  const review = () => h.render().find(node => node.props.label === 'Review adjustment').props.onPress();
  review();
  assert.equal(h.adjusted.length, 0);
  const prompt = h.confirmation();
  assert.equal(prompt.options.rows[0].value, 'Bank');
  assert.match(prompt.options.change.before, /480.00/);
  assert.match(prompt.options.change.after, /300.50/);
  prompt.buttons.find(button => button.text === 'Cancel').onPress();
  assert.equal(h.adjusted.length, 0);
  review(); h.confirmation().buttons.find(button => button.text === 'Confirm').onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.adjusted, [['adjustment-id', 'bank', 30050, 48000]]);
});
