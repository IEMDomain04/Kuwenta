const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');

function harness() {
  const hooks = []; let cursor = 0;
  const saved = [], navigation = [], scrolling = [];
  const accounts = ['cash', 'bank', 'savings'].map(id => ({ id, name: id, purpose: id === 'savings' ? 'savings' : 'spending', openingBalance: 100, archived: false }));
  const state = initial => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks[index], value => { hooks[index] = value; }];
  };
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react') return { useState: state, useRef: value => state(() => ({ current: value }))[0], useEffect() {} };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', Pressable: 'Pressable', useWindowDimensions: () => ({ fontScale: 1 }), Vibration: { vibrate() {} }, PanResponder: { create: handlers => ({ panHandlers: handlers }) } };
    if (name === 'expo-router') return { router: { push: value => navigation.push(value) } };
    if (name === '@react-native-vector-icons/ionicons') return { Ionicons: 'Icon' };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-color-scheme') return { useColorScheme: () => 'light' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({ accent: '#06633E' }) };
    if (name === '../provider') return { useFinance: () => ({ accounts, transactions: [], busy: false, saveAccountOrder: async ids => { saved.push(Array.from(ids)); } }) };
    if (name === '../calculations') return { calculateAccountSummary: () => ({ balance: 100 }) };
    if (name === '../money') return { formatMoney: () => 'PHP 1.00' };
    if (name === './ui') return { ActionButton: 'Button' };
    throw new Error(name);
  } };
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/components/accounts-overview.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0;
    const tree = sandbox.exports.AccountsOverview({ showAdd: false, onDraggingChange: value => scrolling.push(value) });
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || !node.props) return;
      nodes.push(node); walk(node.props.children);
    }
    walk(tree);
    const cards = accounts.map((account, index) => {
      const card = nodes.find(node => node.props.accessibilityLabel?.startsWith(account.name + ','));
      card.props.ref({ measureInWindow: callback => callback(index === 1 ? 110 : 0, index === 2 ? 110 : 0, 100, 100) });
      return card.props;
    });
    return { cards, positions: nodes.filter(node => typeof node.type === 'function' && node.type.name === 'MovingCard').map(node => ({ x: node.props.x, y: node.props.y })), pan: nodes.find(node => node.props.onPanResponderMove).props };
  }
  return { render, saved, navigation, scrolling };
}

test('holding and dragging saves order without navigating, while normal taps still open accounts', () => {
  const h = harness();
  let { cards, pan } = h.render();
  cards[0].onPressIn(); cards[0].onPress();
  assert.equal(h.navigation.length, 1);
  cards[0].onPressIn(); cards[0].onLongPress({ nativeEvent: { pageX: 20, pageY: 20 } });
  ({ cards, pan } = h.render());
  assert.equal(pan.onMoveShouldSetPanResponderCapture(), true);
  pan.onPanResponderMove(null, { moveX: 130, moveY: 20 });
  pan.onPanResponderRelease(); cards[0].onPress();
  assert.deepEqual(h.saved, [['bank', 'cash', 'savings']]);
  assert.equal(h.navigation.length, 1);
  assert.deepEqual(h.scrolling, [true, false]);
});

test('cancelled drags, same-position drops, and cross-purpose drops never save a new order', () => {
  for (const mode of ['cancel', 'same', 'other-group']) {
    const h = harness(); let { cards, pan } = h.render();
    cards[0].onLongPress({ nativeEvent: { pageX: 20, pageY: 20 } });
    ({ pan } = h.render());
    if (mode === 'cancel') { pan.onPanResponderMove(null, { moveX: 130, moveY: 20 }); pan.onPanResponderTerminate(); }
    else { pan.onPanResponderMove(null, { moveX: 20, moveY: mode === 'same' ? 20 : 130 }); pan.onPanResponderRelease(); }
    assert.deepEqual(h.saved, []);
    assert.deepEqual(h.scrolling, [true, false]);
  }
});

test('neighboring cards preview their new slots while dragging and return on cancel', () => {
  const h = harness(); let { cards, pan } = h.render();
  cards[0].onLongPress({ nativeEvent: { pageX: 20, pageY: 20 } });
  ({ pan } = h.render());
  pan.onPanResponderMove(null, { moveX: 130, moveY: 20 });
  assert.deepEqual(h.render().positions, [{ x: 110, y: 0 }, { x: -110, y: 0 }, { x: 0, y: 0 }]);
  assert.deepEqual(h.saved, []);
  pan.onPanResponderTerminate();
  assert.deepEqual(h.render().positions, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
  assert.deepEqual(h.saved, []);
});
