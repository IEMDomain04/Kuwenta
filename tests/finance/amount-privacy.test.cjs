const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const money = require('../../.expo/finance-tests/money.js');
const mask = String.fromCodePoint(8226).repeat(4);
const peso = String.fromCodePoint(8369);
function harness(saved = {}, failStorage = false) {
  const storage = new Map(Object.entries(saved));
  let current, state, initialized = false;
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { if (failStorage) throw new Error('Storage unavailable'); storage.set(key, value); },
  }, require(name) {
    if (name === 'expo-sqlite/localStorage/install') return {};
    if (name === '@/features/finance/money') return money;
    if (name === 'react/jsx-runtime') return { jsx };
    if (name === 'react') return {
      createContext: initial => { current = initial; return { Provider: 'Provider' }; },
      useContext: () => current, useCallback: fn => fn,
      useState: initial => { if (!initialized) { state = initial(); initialized = true; } return [state, value => { state = value; }]; },
    };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/amount-visibility.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, sandbox);
  function render() { current = sandbox.exports.AmountVisibilityProvider({ children: null }).props.value; return sandbox.exports.useAmountVisibility(); }
  return { render, storage, conceal: sandbox.exports.concealAmounts };
}
test('amounts start visible, hide immediately, persist, and restore hidden before first render', () => {
  const h = harness();
  assert.equal(h.render().hidden, false);
  assert.equal(h.render().formatAmount(123456), money.formatMoney(123456));
  h.render().toggle();
  assert.equal(h.render().formatAmount(123456), mask);
  assert.equal(h.storage.get('kuwenta.hideAmounts'), 'true');
  const reopened = harness(Object.fromEntries(h.storage));
  assert.equal(reopened.render().hidden, true);
  assert.equal(reopened.render().formatAmount(-500), mask);
  reopened.render().toggle();
  assert.equal(reopened.render().hidden, false);
  assert.equal(reopened.render().formatAmount(10000, true), money.formatMoney(10000, true));
});
test('hiding removes financial amounts and percentages in insights while preserving dates and names', () => {
  const h = harness();
  const text = `October 2026: Cash has ${peso}1,234.50; -${peso}5.00 fee, PHP 60, 80% used on 2026-10-18.`;
  assert.equal(h.conceal(text, false), text);
  assert.equal(h.conceal(text, true), `October 2026: Cash has ${mask}; ${mask} fee, ${mask}, ${mask} used on 2026-10-18.`);
  assert.equal(h.conceal('Meals and Transport', true), 'Meals and Transport');
});
test('storage write failures still let the user hide and reveal for the current session', () => {
  const h = harness({}, true);
  h.render().toggle(); assert.equal(h.render().hidden, true);
  h.render().toggle(); assert.equal(h.render().hidden, false);
});


test('the eye button exposes the correct action and toggles the shared preference', () => {
  const h = harness();
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if(name === 'react/jsx-runtime') return { jsx };
    if(name === 'react-native') return { Pressable: 'Button' };
    if(name === '@react-native-vector-icons/ionicons') return { Ionicons: 'Icon' };
    if(name === '@/hooks/amount-visibility') return { useAmountVisibility: h.render };
    if(name === '@/hooks/use-theme') return { useTheme: () => ({}) };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/components/amount-visibility-button.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, sandbox);
  const button = () => sandbox.exports.AmountVisibilityButton();
  assert.equal(button().props.accessibilityLabel, 'Hide amounts');
  button().props.onPress();
  assert.equal(button().props.accessibilityLabel, 'Show amounts');
  assert.equal(button().props.children.props.name, 'eye-off-outline');
  button().props.onPress();
  assert.equal(button().props.accessibilityLabel, 'Hide amounts');
});
