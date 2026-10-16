const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { cash } = require('./fixtures.cjs');
const source = ts.transpileModule(fs.readFileSync('src/features/finance/screens/assistant-screen.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(params = {}) {
  const hooks = [], effects = [], sessions = []; let cursor = 0, focus, cleanup, appState;
  const finance = { assistantEnabled: true, busy: false, accounts: [cash], transactions: [], budgets: [], goals: [] };
  const state = initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; };
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react') return { useState: state, useRef: value => state(() => ({ current: value }))[0], useCallback: fn => state(() => fn)[0], useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((value, j) => value !== hooks[i][j])) { hooks[i] = deps; effects.push(fn); } } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', ScrollView: 'ScrollView', TextInput: 'Input', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' }, AppState: { addEventListener(_, fn) { appState = fn; return { remove() {} }; } } };
    if (name === 'expo-router') return { useLocalSearchParams: () => params, useFocusEffect(fn) { focus = fn; }, router: { canGoBack: () => true, back() {} } };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({}) };
    if (name === '../provider') return { useFinance: () => finance };
    if (name === '../components/assistant-message') return { AssistantMessage: 'AssistantMessage' };
    if (name === '../components/ui') return { FinanceScreen: 'Screen', ActionButton: 'Button', BackButton: 'Back' };
    if (name === '../assistant-insights') return require('../../.expo/finance-tests/assistant-insights.js');
    if (name === '../assistant-context') return { assistantQuestionReply: require('../../.expo/finance-tests/assistant-context.js').assistantQuestionReply, buildAssistantContext: () => ({ summary: [], fallback: 'fallback' }), checkedAssistantReply: text => text || undefined };
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
  return { finance, sessions, render, background: () => appState('background'), blur() { cleanup(); }, refocus() { cleanup = focus(); }, send(text) { if (text) { render().find(node => node.type === 'Input').props.onChangeText(text); render().find(node => node.props.label === 'Send').props.onPress(); return; } render().find(node => node.type === 'Button' && node.props.label === 'Can I afford a purchase?').props.onPress(); } };
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
  h.sessions[0].emit('PHP 1000 available.');
  assert.ok(h.render().some(node => node.props.children === 'Replying...'));
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
