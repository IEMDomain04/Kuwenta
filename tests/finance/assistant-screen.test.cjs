const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { cash } = require('./fixtures.cjs');
const source = ts.transpileModule(fs.readFileSync('src/features/finance/screens/assistant-screen.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(params = {}, { manualReveal = false, fallback = 'fallback', summary = [] } = {}) {
  const timers = new Map(); let timerId = 0;
  const revealSandbox = { exports: {}, setTimeout(fn) { const id = ++timerId; timers.set(id, fn); if (!manualReveal) queueMicrotask(() => { if (timers.has(id)) { timers.delete(id); fn(); } }); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(fs.readFileSync('.expo/finance-tests/assistant-reveal.js', 'utf8'), revealSandbox);
  const hooks = [], effects = [], sessions = []; let cursor = 0, focus, cleanup, appState;
  const finance = { assistantEnabled: true, busy: false, accounts: [cash], transactions: [], budgets: [], goals: [] };
  const state = initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; };
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react') return { useState: state, useRef: value => state(() => ({ current: value }))[0], useCallback: fn => state(() => fn)[0], useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((value, j) => value !== hooks[i][j])) { hooks[i] = deps; effects.push(fn); } } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'Input', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' }, AppState: { addEventListener(_, fn) { appState = fn; return { remove() {} }; } } };
    if (name === 'expo-router') return { useLocalSearchParams: () => params, useFocusEffect(fn) { focus = fn; }, router: { canGoBack: () => true, back() {} } };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({}) };
    if (name === '../provider') return { useFinance: () => finance };
    if (name === '../assistant-reveal') return revealSandbox.exports;
    if (name === '../components/assistant-mascot') return { AssistantMascot: 'Mascot' };
    if (name === '../components/assistant-message') return { AssistantMessage: 'AssistantMessage' };
    if (name === '../components/ui') return { FinanceScreen: 'Screen', ActionButton: 'Button', BackButton: 'Back' };
    if (name === '../assistant-insights') return require('../../.expo/finance-tests/assistant-insights.js');
    if (name === '../assistant-context') return { assistantQuestionReply: require('../../.expo/finance-tests/assistant-context.js').assistantQuestionReply, buildAssistantContext: () => ({ summary, fallback }), checkedAssistantReply: text => text || undefined };
    if (name === '../offline-assistant') return { assistantAvailability: () => undefined, createAssistantSession() {
      let finish; const reply = new Promise(resolve => { finish = resolve; });
      const item = { asks: 0, stopped: 0, released: 0, finish, emit: undefined, ask(question, context, history, status, onText) { item.asks++; item.context = context; item.question = question; item.emit = text => { status('answering'); onText?.(text); }; status('thinking'); return reply; }, async stop() { item.stopped++; finish('stopped'); }, async dispose() { item.released++; if (item.asks) await reply; } };
      sessions.push(item); return item;
    } };
    throw new Error('Unexpected dependency ' + name);
  } };
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0; const nodes = [];
    function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node?.props) return; nodes.push(node); walk(node.props.children); }
    walk(sandbox.exports.default()); while (effects.length) effects.shift()(); return nodes;
  }
  render(); cleanup = focus();
  return { finance, sessions, render, timers, flushReveal() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }, background: () => appState('background'), blur() { cleanup(); }, refocus() { cleanup = focus(); }, send(text) { if (text) { render().find(node => node.type === 'Input').props.onChangeText(text); render().find(node => node.props.label === 'Send').props.onPress(); return; } render().find(node => node.type === 'Button' && node.props.label === 'Can I afford a purchase?').props.onPress(); } };
}
test('old replies cannot alter a new focused chat or clear its pending state', async () => {
  const h = harness(); h.send(); await tick(); assert.equal(h.sessions[0].asks, 1);
  h.blur(); h.refocus(); h.send(); await tick();
  h.sessions[0].finish('stale reply'); await tick();
  assert.equal(h.sessions[1].asks, 1);
  assert.ok(h.render().some(node => node.props.label === 'Stop'));
  assert.ok(!h.render().some(node => node.props.text === 'stale reply'));
  h.sessions[1].finish('fresh reply'); await tick();
  assert.ok(h.render().some(node => node.props.text === 'fresh reply'));
  h.blur();
});
test('changing records stops a pending answer and does not show stale figures', async () => {
  const h = harness(); h.send(); await tick();
  h.finance.accounts = [{ ...cash, openingBalance: 20000 }]; h.render(); await tick();
  assert.equal(h.sessions[0].stopped, 1);
  assert.ok(h.render().some(node => node.props.children === 'Your records changed. Ask again for an updated answer.'));
  assert.ok(!h.render().some(node => node.props.text === 'stopped')); h.blur();
});
test('backgrounding releases the model and suppresses the interrupted reply', async () => {
  const h = harness(); h.send(); await tick(); h.background();
  assert.equal(h.sessions[0].released, 1);
  h.sessions[0].finish('interrupted reply'); await tick();
  assert.ok(!h.render().some(node => node.props.text === 'interrupted reply')); h.blur();
});

test('an unrelated programming request is redirected without asking or loading the model', async () => {
  const h = harness(); h.send('Write me a 1+1 python program'); await tick();
  assert.equal(h.sessions[0].asks, 0);
  assert.ok(h.render().some(node => typeof node.props.text === 'string' && node.props.text.startsWith('I can help with your money records')));
  assert.ok(!h.render().some(node => node.props.label === 'Stop')); h.blur();
});


test('Thinking transitions to a single streamed message and Stop retains only checked text', async () => {
  const h = harness(); h.send(); await tick();
  assert.ok(h.render().some(node => node.props.children === 'Thinking...'));
  h.sessions[0].emit('PHP 1000 available.'); await tick();
  assert.ok(!h.render().some(node => node.props.children === 'Thinking...'));
  assert.ok(h.render().some(node => node.props.label === 'Stop'));
  assert.equal(h.render().filter(node => node.props.text === 'PHP 1000 available.').length, 1);
  h.render().find(node => node.props.label === 'Stop').props.onPress(); await tick();
  assert.ok(h.render().some(node => node.props.children === 'Stopped'));
  h.blur();
});
test('Explain passes a selected insight and preserves its category on Why followups', async () => {
  const h = harness({ insight: 'Food is your largest expense category.', selection: JSON.stringify({ kind: 'category', period: '2026-10', category: 'Food' }) });
  h.send('Explain this'); await tick();
  assert.ok(h.sessions[0].context.facts.some(text => text.includes('Selected insight:')));
  h.sessions[0].finish('Food explanation'); await tick();
  h.send('Why?'); await tick();
  assert.ok(h.sessions[0].context.facts.some(text => text.includes('"category":"Food"')));
  h.blur();
});


test('a failed final check replaces a partial reply with one calculated fallback', async () => {
  const h = harness(); h.send(); await tick(); h.sessions[0].emit('PHP 1000 available.');
  h.sessions[0].finish(''); await tick();
  assert.ok(h.render().some(node => node.props.children === 'Recorded summary'));
  assert.equal(h.render().filter(node => node.props.text === 'fallback').length, 1);
  assert.ok(!h.render().some(node => node.props.text === 'PHP 1000 available.')); h.blur();
});
test('changing records immediately discards a partial reply', async () => {
  const h = harness(); h.send(); await tick(); h.sessions[0].emit('PHP 1000 available.');
  h.finance.accounts = [{ ...cash, openingBalance: 20000 }]; h.render();
  assert.ok(!h.render().some(node => node.props.text === 'PHP 1000 available.')); await tick(); h.blur();
});


test('large native chunks reveal progressively and Stop cancels the display timer', async () => {
  const h = harness({}, { manualReveal: true }); h.send(); await tick();
  assert.ok(h.render().some(node => node.type === 'Mascot' && node.props.thinking && node.props.animated));
  h.sessions[0].emit('Your available balance is PHP 1000 for spending.');
  assert.ok(!h.render().some(node => node.props.text === 'Your available balance is PHP 1000 for spending.'));
  assert.ok(h.render().some(node => node.props.text === 'Your available '));
  assert.ok(h.timers.size > 0);
  h.render().find(node => node.props.label === 'Stop').props.onPress(); await tick();
  assert.equal(h.timers.size, 0);
  assert.ok(h.render().some(node => node.props.children === 'Stopped'));
  h.blur();
});

test('whole final replies reveal in chunks and replace the thinking mascot with text', async () => {
  const h = harness({}, { manualReveal: true }); h.send(); await tick();
  const reply = 'You have PHP 1000 available for your recorded spending.';
  h.sessions[0].finish(reply); await tick();
  assert.ok(!h.render().some(node => node.props.text === reply));
  assert.ok(h.render().some(node => node.props.label === 'Stop'));
  for (let i = 0; i < 10; i++) { h.flushReveal(); await tick(); }
  assert.equal(h.render().filter(node => node.props.text === reply).length, 1);
  assert.ok(!h.render().some(node => node.props.label === 'Stop'));
  assert.equal(h.render().filter(node => node.type === 'Mascot').length, 0);
  h.blur();
});

test('leaving chat cancels progressive display without leaving scheduled updates', async () => {
  const h = harness({}, { manualReveal: true }); h.send(); await tick();
  h.sessions[0].finish('Your recorded money can be reviewed with your budgets.'); await tick();
  assert.ok(h.timers.size > 0); h.blur(); await tick();
  assert.equal(h.timers.size, 0);
});

test('chat follows new replies only while the user remains near the bottom', () => {
  const h = harness(); let scrolls = 0;
  const scroll = h.render().find(node => node.type === 'ScrollView');
  scroll.props.ref.current = { scrollToEnd() { scrolls++; } };
  scroll.props.onContentSizeChange(); assert.equal(scrolls, 1);
  scroll.props.onScrollBeginDrag(); scroll.props.onContentSizeChange(); assert.equal(scrolls, 1);
  scroll.props.onScroll({ nativeEvent: { contentSize: { height: 1000 }, layoutMeasurement: { height: 400 }, contentOffset: { y: 600 } } });
  scroll.props.onContentSizeChange(); assert.equal(scrolls, 2); h.blur();
});


test('calculated fallback replies also appear progressively and cancel if records change', async () => {
  const fallback = 'You have PHP 1000 available based on your recorded activity.';
  const h = harness({}, { manualReveal: true, fallback }); h.send(); await tick();
  h.sessions[0].finish(''); await tick();
  assert.ok(h.render().some(node => node.props.children === 'Recorded summary'));
  assert.ok(!h.render().some(node => node.props.text === fallback));
  assert.ok(h.timers.size > 0);
  h.finance.accounts = [{ ...cash, openingBalance: 20000 }]; h.render(); await tick();
  assert.equal(h.timers.size, 0);
  assert.ok(!h.render().some(node => node.props.text === fallback)); h.blur();
});


test('one thinking mascot becomes the response without a duplicate Assistant header or empty reply', async () => {
  const h = harness({}, { manualReveal: true }); h.send(); await tick();
  const thinking = h.render();
  assert.equal(thinking.filter(node => node.type === 'Mascot').length, 1);
  assert.equal(thinking.filter(node => node.type === 'AssistantMessage').length, 0);
  assert.ok(!thinking.some(node => node.props.children === 'Assistant'));
  h.sessions[0].emit('Your available balance is PHP 1000.');
  const replying = h.render();
  assert.equal(replying.filter(node => node.type === 'Mascot').length, 0);
  assert.equal(replying.filter(node => node.type === 'AssistantMessage').length, 1);
  assert.ok(!replying.some(node => node.props.children === 'Thinking...' || node.props.children === 'Assistant'));
  h.render().find(node => node.props.label === 'Stop').props.onPress(); await tick(); h.blur();
});


test('figures used are collapsed until requested and can be hidden again', async () => {
  const h = harness({}, { summary: ['Available for spending: PHP 1000'] }); h.send(); await tick();
  h.sessions[0].finish('Your available money is PHP 1000.'); await tick();
  const figure = () => h.render().some(node => node.props.children === 'Available for spending: PHP 1000');
  assert.equal(figure(), false);
  h.render().find(node => node.props.accessibilityLabel === 'View figures used').props.onPress();
  assert.equal(figure(), true);
  h.render().find(node => node.props.accessibilityLabel === 'Hide figures used').props.onPress();
  assert.equal(figure(), false); h.blur();
});
