const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { record } = require('./fixtures.cjs');
function mount(hidden = false, dark = false) {
  const values = []; let cursor = 0; const routes = [];
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { useMemo: fn => fn(), useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; } };
    if (name === 'react-native') return { View: 'View', Pressable: 'Pressable', useWindowDimensions: () => ({ fontScale: 1 }) };
    if (name === 'expo-router') return { router: { push: route => routes.push(route) } };
    if (name === '@/hooks/amount-visibility') return { HIDDEN_AMOUNT: 'HIDDEN', useAmountVisibility: () => ({ hidden, conceal: text => text, formatAmount: amount => hidden ? 'HIDDEN' : 'PHP ' + amount / 100 }) };
    if (name === '@/hooks/use-color-scheme') return { useColorScheme: () => dark ? 'dark' : 'light' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({ backgroundElement: '#FFFFFF', background: '#EEEEEE', text: '#000000', backgroundSelected: '#DDFFDD' }) };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === './category-visual') return { categoryVisual: () => ({ color: dark ? '#99CC99' : '#225522' }) };
    if (name === './ui') return { ActionButton: 'Button' };
    if (['../dashboard', '../dates', '../spending-blocks'].includes(name)) return require('../../.expo/finance-tests/' + name.slice(3) + '.js');
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/components/category-spending.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, sandbox);
  return { render(props) { cursor = 0; return sandbox.exports.CategorySpending(props); }, routes };
}
function nodes(tree) { const result = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; result.push(node); walk(node.props.children); } walk(tree); return result; }
const props = { transactions: [record({ id: 'meal', category: 'Meals', amount: 12000 }), record({ id: 'fee:extra', category: 'Fees', notes: 'Cash-in service charge', amount: 100, exchangeParentId: 'exchange' }), record({ id: 'outside', transactionDate: '2026-09-01', amount: 50000 }), record({ id: 'income', type: 'INCOME', amount: 90000 })], start: '2026-10-01', end: '2026-10-31', period: 'month' };

test('category blocks reveal period-specific details and transactions, with exchange fees opening the parent', () => {
  for (const dark of [false, true]) {
    const api = mount(false, dark);
    let tree = nodes(api.render(props));
    tree.find(node => node.props.onLayout).props.onLayout({ nativeEvent: { layout: { width: 320 } } });
    tree = nodes(api.render(props));
    const blocks = tree.filter(node => typeof node.props.style === 'function' && node.props.style({}).position === 'absolute');
    assert.equal(blocks.length, 2);
    blocks.find(node => node.props.accessibilityLabel.startsWith('Fees,')).props.onPress();
    tree = nodes(api.render(props));
    assert.ok(tree.some(node => node.props.children === 'Fees'));
    const transactions = tree.filter(node => node.props.accessibilityLabel?.startsWith('View '));
    assert.equal(transactions.length, 1);
    assert.ok(nodes(transactions[0]).some(node => node.props.children === 'Cash-in service charge' && node.props.numberOfLines === 2));
    assert.ok(transactions[0].props.accessibilityLabel.includes('Cash-in service charge'));
    transactions[0].props.onPress();
    assert.equal(api.routes[0].params.id, 'exchange');
    assert.ok(!nodes(api.render({ ...props, start: '2026-09-01', end: '2026-09-30' })).some(node => node.props.accessibilityLabel?.startsWith('View ')));
    tree.find(node => node.type === 'Pressable' && node.props.accessibilityLabel?.startsWith('Fees,') && typeof node.props.style === 'function' && node.props.style({}).minHeight === 44).props.onPress();
    tree = nodes(api.render(props));
    assert.ok(!tree.some(node => node.props.accessibilityLabel?.startsWith('View ')));
    assert.ok(!tree.some(node => node.props.accessibilityState?.selected));
    assert.ok(!JSON.stringify(api.render(props)).includes('Total expenses:'));
    assert.ok(!tree.some(node => ['View transactions', 'Hide transactions'].includes(node.props.label)));
  }
});

test('hidden amounts stay masked in blocks, category details, transactions, and accessibility labels', () => {
  const api = mount(true);
  let tree = nodes(api.render(props));
  tree.find(node => node.props.accessibilityLabel?.startsWith('Meals,')).props.onPress();
  const rendered = JSON.stringify(api.render(props));
  for (const amount of ['PHP ', '99.2%', '120.00']) assert.ok(!rendered.includes(amount));
  assert.ok(rendered.includes('HIDDEN'));
});

test('empty category chart has a clear empty state', () => {
  assert.ok(nodes(mount().render({ ...props, transactions: [] })).some(node => node.props.children === 'No expenses recorded for this period.'));
});


test('selection appears below its row, moves to another category, and toggles from either control', () => {
  const api = mount();
  let tree = nodes(api.render(props));
  tree.find(node => node.props.accessibilityLabel?.startsWith('Meals,')).props.onPress();
  tree = nodes(api.render(props));
  const wrapper = tree.find(node => node.type === 'View' && Array.isArray(node.props.children) && node.props.children[0]?.props?.accessibilityLabel?.startsWith('Meals,'));
  assert.equal(wrapper.props.children[0].props.accessibilityState.expanded, true);
  assert.ok(nodes(wrapper.props.children[1]).some(node => node.props.accessibilityLabel?.startsWith('View Meals,')));
  assert.ok(nodes(wrapper.props.children[1]).some(node => node.props.children === 'Meals' && node.props.numberOfLines === 2));
  tree.find(node => node.props.accessibilityLabel?.startsWith('Fees,')).props.onPress();
  tree = nodes(api.render(props));
  assert.ok(tree.some(node => node.props.accessibilityLabel?.startsWith('View Fees,')));
  assert.ok(!tree.some(node => node.props.accessibilityLabel?.startsWith('View Meals,')));
});

test('small hidden categories reveal their row and paginate transactions on selection', () => {
  const api = mount();
  const many = { ...props, transactions: Array.from({ length: 6 }, (_, i) => record({ id: 'category-' + i, category: 'Category ' + i, amount: (6 - i) * 10000 })).concat(Array.from({ length: 11 }, (_, i) => record({ id: 'tiny-' + i, category: 'Tiny', amount: 1 }))) };
  let tree = nodes(api.render(many));
  tree.find(node => node.props.onLayout).props.onLayout({ nativeEvent: { layout: { width: 320 } } });
  tree = nodes(api.render(many));
  tree.find(node => node.props.accessibilityLabel?.startsWith('Tiny,')).props.onPress();
  tree = nodes(api.render(many));
  assert.ok(tree.some(node => node.props.children === 'Tiny'));
  assert.equal(tree.filter(node => node.props.accessibilityLabel?.startsWith('View Tiny,')).length, 10);
  tree.find(node => node.props.label === 'Show more transactions').props.onPress();
  tree = nodes(api.render(many));
  assert.equal(tree.filter(node => node.props.accessibilityLabel?.startsWith('View Tiny,')).length, 11);
  tree.find(node => node.props.accessibilityLabel?.startsWith('Tiny,')).props.onPress();
  tree = nodes(api.render(many));
  assert.equal(tree.filter(node => node.props.accessibilityLabel?.startsWith('View Tiny,')).length, 0);
});


test('category visual caps blocks and expanded rows at ten, initially showing five', () => {
  const api = mount();
  const limited = { ...props, transactions: Array.from({ length: 12 }, (_, i) => record({ id: 'limit-' + i, category: 'Limit ' + i, amount: (12 - i) * 100 })) };
  const before = JSON.stringify(limited.transactions);
  let tree = nodes(api.render(limited));
  tree.find(node => node.props.onLayout).props.onLayout({ nativeEvent: { layout: { width: 320 } } });
  tree = nodes(api.render(limited));
  function blocks(tree) { return tree.filter(node => typeof node.props.style === 'function' && node.props.style({}).position === 'absolute'); }
  function rows(tree) { return tree.filter(node => node.type === 'Pressable' && typeof node.props.style === 'function' && node.props.style({}).minHeight === 44 && node.props.accessibilityLabel?.startsWith('Limit ')); }
  assert.equal(blocks(tree).length, 10);
  assert.equal(rows(tree).length, 5);
  assert.ok(blocks(tree).find(node => node.props.accessibilityLabel.startsWith('Limit 0,')).props.accessibilityLabel.includes('16.0% of shown categories'));
  tree.find(node => node.props.label === 'Others').props.onPress();
  tree = nodes(api.render(limited));
  assert.equal(rows(tree).length, 10);
  assert.equal(blocks(tree).length, 10);
  for (const excluded of ['Limit 10,', 'Limit 11,']) assert.ok(!tree.some(node => node.props.accessibilityLabel?.startsWith(excluded)));
  tree.find(node => node.props.label === 'Show less').props.onPress();
  assert.equal(rows(nodes(api.render(limited))).length, 5);
  assert.equal(JSON.stringify(limited.transactions), before);
});
