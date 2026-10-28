const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function mount({ hidden = false, dark = false, reduced = false, opaque = false, platform = 'android' } = {}) {
  const hooks = [], effects = [], animations = [], listeners = new Map(); let cursor = 0, dismissed = 0;
  const state = initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = value; }]; };
  const jsx = (type, props) => ({ type, props });
  class Value { constructor(value) { this.value = value; } interpolate(config) { return { interpolation: config }; } }
  const theme = { backgroundElement: dark ? '#192D21' : '#FFFFFF', text: dark ? '#FFFFFF' : '#082417', textSecondary: dark ? '#B8C9BE' : '#476052', border: '#73877A', error: '#B4233C', secondary: '#17658F', income: '#06633E' };
  const sandbox = { exports: {}, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { useState: state, useRef: initial => state(() => ({ current: initial }))[0], useEffect(callback, dependencies) { const i = cursor++; const old = hooks[i]; if (!old || dependencies.some((value, index) => value !== old.dependencies[index])) effects.push(() => { old?.cleanup?.(); hooks[i] = { dependencies, cleanup: callback() }; }); } };
    if (name === 'react-native') return { View: 'View', Pressable: 'Pressable', Platform: { OS: platform }, AccessibilityInfo: {
      isReduceMotionEnabled: async () => reduced, isReduceTransparencyEnabled: async () => opaque, isHighTextContrastEnabled: async () => opaque,
      addEventListener: (name, callback) => { listeners.set(name, callback); return { remove: () => listeners.delete(name) }; },
    }, Animated: { Value, View: 'AnimatedView', timing(value, config) { const animation = { config, active: false, start(callback) { this.callback = callback; this.active = true; if (!config.duration) this.complete(); }, complete() { if (this.active) { this.active = false; value.value = config.toValue; this.callback({ finished: true }); } }, stop() { if (this.active) { this.active = false; this.callback({ finished: false }); } } }; animations.push(animation); return animation; } } };
    if (name === 'expo-linear-gradient') return { LinearGradient: 'Gradient' };
    if (name === '@react-native-vector-icons/ionicons') return { Ionicons: 'Icon' };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, left: 0, right: 0 }) };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/amount-visibility') return { useAmountVisibility: () => ({ conceal: text => hidden ? text.replace(/PHP \d+(?:\.\d+)?/g, 'HIDDEN') : text }) };
    if (name === '@/hooks/use-color-scheme') return { useColorScheme: () => dark ? 'dark' : 'light' };
    if (name === '@/hooks/use-theme') return { useTheme: () => theme };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/components/finance-notice.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, sandbox);
  return { render(notice) { cursor = 0; const tree = sandbox.exports.FinanceNotice({ notice, onDismiss: () => { dismissed++; } }); effects.splice(0).forEach(effect => effect()); return tree; }, animations, listeners, theme, dismissed: () => dismissed };
}
function nodes(tree) { const result = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; result.push(node); walk(node.props.children); } walk(tree); return result; }
const notice = { message: 'Expense saved', detail: 'PHP 120.50 - Meals', tone: 'expense' };
const settle = () => new Promise(resolve => setImmediate(resolve));

test('glassy notices preserve masking, dismissal, wrapping and safe placement in both themes', async () => {
  for (const dark of [false, true]) {
    const app = mount({ hidden: true, dark }); app.render(notice); await settle();
    const tree = app.render(notice); const items = nodes(tree);
    assert.equal(tree.props.style.top, 104);
    assert.ok(items.some(node => node.type === 'Gradient'));
    const text = items.find(node => node.props.accessibilityLiveRegion === 'polite');
    assert.ok(text.props.accessibilityLabel.includes('HIDDEN'));
    assert.ok(!JSON.stringify(tree).includes('120.50'));
    for (const node of items.filter(node => node.type === 'Text')) assert.equal(node.props.numberOfLines, undefined);
    items.find(node => node.props.accessibilityLabel === 'Dismiss notice').props.onPress();
    assert.equal(app.dismissed(), 1);
    assert.equal(app.animations.at(-1).config.duration, 180);
    assert.equal(app.animations.at(-1).config.useNativeDriver, true);
  }
});

test('reduced motion and transparency preferences use an immediate, solid accessible notice', async () => {
  const app = mount({ reduced: true, opaque: true, platform: 'ios' }); app.render(notice); await settle();
  let tree = app.render(notice);
  assert.ok(!nodes(tree).some(node => node.type === 'Gradient'));
  assert.equal(nodes(tree).find(node => node.type === 'AnimatedView').props.style.backgroundColor, app.theme.backgroundElement);
  assert.equal(app.animations.at(-1).config.duration, 0);
  assert.ok(app.listeners.has('reduceTransparencyChanged'));
  app.listeners.get('reduceTransparencyChanged')(false);
  assert.ok(nodes(app.render(notice)).some(node => node.type === 'Gradient'));
  app.render(null);
  assert.equal(app.render(null), null);
});

test('exit fades retain the notice until completion and replacements cancel stale exits', async () => {
  const app = mount(); app.render(notice); await settle(); app.render(notice); app.animations.at(-1).complete();
  assert.ok(app.render(null)); const exit = app.animations.at(-1);
  assert.equal(exit.config.duration, 140);
  assert.equal(app.render(null).props.pointerEvents, 'none');
  const replacement = { message: 'Could not save. Your entries are still here.', tone: 'error' };
  app.render(replacement); exit.complete();
  const tree = app.render(replacement);
  assert.ok(nodes(tree).some(node => node.props.accessibilityRole === 'alert' && node.props.accessibilityLiveRegion === 'assertive'));
  assert.ok(JSON.stringify(tree).includes(replacement.message));
  app.render(null); app.animations.at(-1).complete();
  assert.equal(app.render(null), null);
});
