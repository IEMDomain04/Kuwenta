const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const money = require('../../.expo/finance-tests/money.js');
const cash = { id: 'cash', name: 'Cash', currency: 'PHP', openingBalance: 100000, purpose: 'spending', includedInAvailable: true, archived: false };
function render(accounts, transactions = []) {
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react') return { useMemo: factory => factory() };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View' };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({ accent: 'green', secondary: 'blue', expense: 'red' }) };
    if (name === '../provider') return { useFinance: () => ({ accounts, transactions }) };
    if (name === './account-icon') return { AccountIcon: 'Icon' };
    if (name === '../money') return money;
    if (name === '../calculations') return require('../../.expo/finance-tests/calculations.js');
    throw new Error(name);
  } };
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/components/account-balances.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, sandbox);
  const nodes = [];
  function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; nodes.push(node); walk(node.props.children); }
  walk(sandbox.exports.AccountBalances());
  return nodes;
}
test('balance visualization includes savings, negative and archived accounts with matching totals', () => {
  const accounts = [cash, { ...cash, id: 'savings', name: 'Savings', openingBalance: 200000, purpose: 'savings', includedInAvailable: false }, { ...cash, id: 'bank', name: 'Bank', openingBalance: -5000, archived: true }];
  const nodes = render(accounts);
  for (const account of accounts) assert.ok(nodes.some(node => node.props.accessibilityLabel === account.name + ', balance ' + money.formatMoney(account.openingBalance)));
  assert.ok(nodes.some(node => node.type === 'Text' && node.props.style?.color === 'red'));
  assert.ok(nodes.some(node => node.type === 'Text' && node.props.style?.color === 'blue'));
  assert.ok(nodes.some(node => JSON.stringify(node.props.children).includes('Not in available money')));
  assert.ok(nodes.some(node => JSON.stringify(node.props.children).includes('Archived')));
  assert.ok(nodes.some(node => JSON.stringify(node.props.children) === JSON.stringify(['Total money: ', money.formatMoney(295000, true)])));
  assert.ok(nodes.some(node => JSON.stringify(node.props.children) === JSON.stringify(['Available for spending: ', money.formatMoney(95000, true)])));
});
test('balance visualization works before transactions and handles zero balances', () => {
  const nodes = render([{ ...cash, openingBalance: 0 }]);
  assert.ok(nodes.some(node => node.props.accessibilityLabel === 'Cash, balance ' + money.formatMoney(0)));
  assert.ok(nodes.some(node => node.props.style?.width === '0%'));
});
