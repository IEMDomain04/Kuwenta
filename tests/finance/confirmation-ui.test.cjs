const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = ts.transpileModule(fs.readFileSync('src/features/finance/components/confirmation.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function harness(dark = false) {
  const hooks = [], effects = []; let cursor = 0, dismissed = 0;
  const theme = { background: dark ? '#0C1711' : '#F3F8F5', backgroundElement: dark ? '#192A21' : '#FFFFFF', text: dark ? '#F1F7F3' : '#0A1129', textSecondary: '#73877A', border: '#73877A', overlay: '#00000099', backgroundSelected: '#264937', accent: '#06633E', accentPressed: '#044C30', onAccent: dark ? '#082417' : '#FFFFFF', error: dark ? '#FF91A1' : '#B4233C', errorSurface: '#42252E' };
  const state = initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], value => { hooks[index] = value; }]; };
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react') return { createContext: () => ({ Provider: 'Provider' }), useContext: () => null, useState: state, useRef: value => state(() => ({ current: value }))[0], useMemo: factory => state(factory)[0], useEffect: effect => { state(() => { effects.push(effect()); return true; }); } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { Keyboard: { dismiss() { dismissed++; } }, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View' };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
    if (name === '@react-native-vector-icons/ionicons') return { Ionicons: 'Icon' };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-theme') return { useTheme: () => theme };
    throw new Error(name);
  } };
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0; const tree = sandbox.exports.ConfirmationProvider({ children: 'App' });
    const nodes = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; nodes.push(node); walk(node.props.children); } walk(tree);
    return { alert: tree.props.value.alert, modal: nodes.find(node => node.type === 'Modal'), nodes, button: text => nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === text) };
  }
  return { render, theme, dismissed: () => dismissed, unmount: () => effects.forEach(cleanup => cleanup?.()) };
}
test('confirmation shows structured before/after values, centered layout and one row of actions in both themes', () => {
  for (const dark of [false, true]) {
    const h = harness(dark); let saved = 0;
    h.render().alert('Adjust balance?', 'Records a correction.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => saved++ }], { rows: [{ label: 'Account', value: 'Cash' }], change: { label: 'Balance', before: 'PHP 500.00', after: 'PHP 300.00' } });
    const view = h.render();
    assert.equal(view.modal.props.visible, true);
    assert.equal(saved, 0);
    assert.equal(h.dismissed(), 1);
    assert.ok(view.nodes.some(node => node.type === 'SafeAreaView' && node.props.style.justifyContent === 'center'));
    assert.ok(view.nodes.some(node => node.props.style?.backgroundColor === h.theme.backgroundElement));
    assert.ok(view.nodes.some(node => node.type === 'View' && node.props.style.flexDirection === 'row' && node.props.children?.[0]?.type === 'Pressable'));
    for (const text of ['Cash', 'PHP 500.00', 'PHP 300.00']) assert.ok(view.nodes.some(node => node.type === 'Text' && node.props.children === text));
    const action = view.button('Confirm');
    action.props.onPress(); action.props.onPress();
    assert.equal(saved, 1);
    assert.equal(h.render().modal.props.visible, false);
  }
});
test('cancel and Android back never call the destructive action; deletion uses the themed error color', () => {
  const h = harness(true); let removed = 0, cancelled = 0;
  const ask = () => h.render().alert('Delete account?', 'Records will be removed.', [{ text: 'Cancel', style: 'cancel', onPress: () => cancelled++ }, { text: 'Delete', style: 'destructive', onPress: () => removed++ }]);
  ask(); let view = h.render();
  assert.equal(view.button('Delete').props.style({ pressed: false }).backgroundColor, h.theme.error);
  view.button('Cancel').props.onPress();
  assert.equal(cancelled, 1); assert.equal(removed, 0);
  ask(); view = h.render(); view.modal.props.onRequestClose();
  assert.equal(cancelled, 2); assert.equal(removed, 0);
  ask(); h.render().button('Delete').props.onPress();
  assert.equal(removed, 1);
});
test('overlapping requests and unmount cancel pending confirmations without executing changes', () => {
  const h = harness(); let cancelled = 0, blocked = 0, changed = 0;
  const api = h.render();
  api.alert('First', '', [{ text: 'Cancel', style: 'cancel', onPress: () => cancelled++ }, { text: 'Confirm', onPress: () => changed++ }]);
  api.alert('Second', '', [{ text: 'Cancel', style: 'cancel', onPress: () => blocked++ }, { text: 'Confirm', onPress: () => changed++ }]);
  assert.equal(blocked, 1);
  const view = h.render(); h.unmount(); view.button('Confirm').props.onPress();
  assert.equal(cancelled, 1); assert.equal(changed, 0);
});
