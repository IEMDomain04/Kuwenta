const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
const { cash, record } = require('./fixtures.cjs');
const source = ts.transpileModule(fs.readFileSync('src/features/finance/screens/account-screen.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness({ id = 'bank', archived = false, movements = [] } = {}) {
  const hooks = []; let cursor = 0, confirmation;
  const removed = [], saved = [], adjusted = [], opened = [];
  const accounts = [cash, { ...cash, id: 'bank', name: 'Bank', purpose: 'savings', includedInAvailable: false, openingBalance: 50000, archived }];
  const finance = {
    accounts, transactions: [record({ accountId: 'bank' }), record({ id: 'transfer', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'bank', amount: 10000 }), ...movements],
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
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ id }), router: { canGoBack: () => true, back() {}, push(value) { opened.push(value); }, replace() {} } };
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
  return { render, pressOption, removed, saved, adjusted, opened, confirmation: () => confirmation };
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

test('Edit account replaces Adjust balance beside Transfer money and is absent from the options menu',()=>{
 const h=harness();const nodes=h.render();
 assert.ok(nodes.some(node=>node.props.label==='Transfer money'));assert.ok(nodes.some(node=>node.props.label==='Edit account'));
 assert.ok(!nodes.some(node=>node.props.label==='Adjust balance'));
 assert.ok(!nodes.some(node=>node.type==='Text' && node.props.children==='Edit account'));
 nodes.find(node=>node.props.label==='Edit account').props.onPress();
 assert.ok(h.render().some(node=>node.type==='AccountManager'));
 assert.ok(!harness({archived:true}).render().some(node=>node.props.label==='Edit account'));
});


test('external movement rows open their dedicated editor from account details', () => {
  const movement = record({ id: 'external-row', accountId: 'bank', type: 'EXTERNAL', category: 'External transfer', externalName: 'Friend', adjustmentDirection: 'increase' });
  const h = harness({ movements: [movement] });
  const row = h.render().find(node => node.props.accessibilityLabel === 'Edit external movement with Friend');
  assert.equal(row.props.accessibilityRole, 'button'); row.props.onPress();
  assert.equal(h.opened[0].pathname, '/transfer'); assert.equal(h.opened[0].params.id, movement.id);
});
