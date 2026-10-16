const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const model = require('../../assets/models/model.json');
const source = ts.transpileModule(fs.readFileSync('src/features/finance/offline-assistant.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const facts = { facts: ['Available: PHP 1000'], summary: [], fallback: '' };
function deferred() { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; }
function harness({ go = false, initGate, completionGate, cached = true, chunks = [], clock, stopBehavior = 'promise' } = {}) {
  const calls = [];
  const context = { getFormattedChat: async () => ({ prompt: 'formatted' }), tokenize: async () => ({ tokens: [1, 2] }), completion: async (options, onToken) => { for (const data of chunks) onToken?.(data); calls.push(['completion', options, onToken]); return completionGate ? completionGate.promise : { content: 'PHP 1000 available.' }; }, stopCompletion: () => { calls.push(['stop']); completionGate?.resolve({ content: 'stopped' }); if (stopBehavior === 'void') return; if (stopBehavior === 'throw') throw new Error('Native stop failed'); if (stopBehavior === 'reject') return Promise.reject(new Error('Native stop failed')); return Promise.resolve(); }, release: async () => calls.push(['release']) };
  const sandbox = { ...(clock ? { Date: { now: clock } } : {}), exports: {}, require(name) {
    if (name === 'expo-constants') return { __esModule: true, default: { executionEnvironment: go ? 'store' : 'standalone' }, ExecutionEnvironment: { StoreClient: 'store' } };
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name.endsWith('model.json')) return model;
    if (name === './assistant-context') return { ASSISTANT_SYSTEM_PROMPT: 'facts only', checkedAssistantReply: require('../../.expo/finance-tests/assistant-context.js').checkedAssistantReply };
    if (name === 'expo-file-system/legacy') return { cacheDirectory: 'file:///cache/', getInfoAsync: async path => ({ exists: path.endsWith('.part') || cached, size: model.bytes }), copyAsync: async options => calls.push(['copy', options]), deleteAsync: async () => {}, moveAsync: async options => calls.push(['move', options]) };
    if (name === 'llama.rn') { calls.push(['native-import']); return { initLlama: async options => { calls.push(['init', options]); if (initGate) await initGate.promise; return context; } }; }
    throw new Error('Unexpected import ' + name);
  } };
  vm.runInNewContext(source, sandbox);
  return { calls, session: sandbox.exports.createAssistantSession(), available: sandbox.exports.assistantAvailability };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('session is lazy and Expo Go never imports the native runtime', async () => {
  const h = harness({ go: true }); assert.equal(h.calls.length, 0);
  await assert.rejects(h.session.ask('Hi', facts, [], () => {}), /updated Kuwenta build/);
  assert.equal(h.calls.length, 0); await h.session.dispose();
});
test('bundled Android model prepares an absolute cache URI only when required', async () => {
  const h = harness({ cached: false });
  assert.equal(h.calls.length, 0);
  assert.equal(await h.session.ask('Balance?', facts, [], () => {}), 'PHP 1000 available.');
  const copy = h.calls.find(call => call[0] === 'copy')[1];
  assert.equal(copy.from, 'asset:///' + model.file);
  assert.ok(copy.to.startsWith('file:///cache/'));
  assert.equal(h.calls.find(call => call[0] === 'init')[1].n_ctx, 2048);
  assert.equal(h.calls.find(call => call[0] === 'completion')[1].enable_thinking, false);
  await h.session.dispose(); assert.equal(h.calls.filter(call => call[0] === 'release').length, 1);
});
test('leaving during initialization waits, skips completion and releases exactly once', async () => {
  const gate = deferred(); const h = harness({ initGate: gate });
  const reply = h.session.ask('Balance?', facts, [], () => {});
  const rejected = assert.rejects(reply, /stopped/);
  await tick(); const disposal = h.session.dispose(); gate.resolve();
  await rejected; await disposal; await h.session.dispose();
  assert.equal(h.calls.filter(call => call[0] === 'completion').length, 0);
  assert.equal(h.calls.filter(call => call[0] === 'release').length, 1);
});
test('Stop cancels a running reply; a second simultaneous request is rejected', async () => {
  const gate = deferred(); const h = harness({ completionGate: gate });
  const reply = h.session.ask('Balance?', facts, [], () => {}); const rejected = assert.rejects(reply, /stopped/);
  await tick(); await assert.rejects(h.session.ask('Again', facts, [], () => {}), /Wait/);
  await h.session.stop(); await rejected; await h.session.dispose();
  assert.equal(h.calls.filter(call => call[0] === 'release').length, 1);
});


test('streaming uses cumulative parsed content, waits for complete decimal amounts, and exposes no reasoning', async () => {
  const h = harness({ chunks: [
    { token: '', content: '', reasoning_content: 'hidden reasoning' },
    { token: '\n', content: '\n' },
    { token: 'PHP 99.', content: 'PHP 99.' },
    { token: '50 available. ', content: '**PHP 99.50 available.** ' },
  ] });
  const displayed = [], statuses = [];
  const context = { facts: ['Available: PHP 99.50'], summary: [], fallback: '', requiredAmounts: [9950] };
  await h.session.ask('Balance?', context, [], value => statuses.push(value), text => displayed.push(text));
  assert.ok(statuses.includes('thinking')); assert.ok(statuses.includes('answering'));
  assert.deepEqual(displayed, ['**PHP 99.50 available.**']);
  assert.ok(!h.calls.some(call => call[0] === 'stop'));
  await h.session.dispose();
});
test('an unsupported streamed amount or code stops generation without displaying it', async () => {
  for (const content of ['PHP 999 available. ', '```python\n']) {
    const h = harness({ chunks: [{ token: content, content }] }); const displayed = [];
    assert.equal(await h.session.ask('Balance?', facts, [], () => {}, text => displayed.push(text)), '');
    assert.equal(displayed.length, 0); assert.ok(h.calls.some(call => call[0] === 'stop')); await h.session.dispose();
  }
});


test('late native callbacks cannot change an already completed reply', async () => {
  const h = harness({ chunks: [{ token: 'PHP 1000 available. ', content: 'PHP 1000 available. ' }] });
  const displayed = [];
  await h.session.ask('Balance?', facts, [], () => {}, text => displayed.push(text));
  const callback = h.calls.find(call => call[0] === 'completion')[2];
  callback({ token: 'PHP 999 available. ', content: 'PHP 999 available. ' });
  assert.deepEqual(displayed, ['PHP 1000 available.']);
  assert.ok(!h.calls.some(call => call[0] === 'stop')); await h.session.dispose();
});


test('checked whole words arrive during generation without waiting for a whole sentence', async () => {
  let time = 0;
  const h = harness({ clock: () => time += 100, chunks: [{ token: 'You ', content: 'You ' }, { token: 'have ', content: 'You have ' }, { token: 'PHP 1000 available. ', content: 'You have PHP 1000 available. ' }] });
  const displayed = [];
  await h.session.ask('Balance?', facts, [], () => {}, text => displayed.push(text));
  assert.deepEqual(displayed, ['You', 'You have', 'You have PHP 1000 available.']); await h.session.dispose();
});


test('stream rejection and disposal accept native stop returning undefined', async () => {
  const h = harness({ stopBehavior: 'void', chunks: [{ token: 'PHP 999 ', content: 'PHP 999 ' }] });
  assert.equal(await h.session.ask('Balance?', facts, [], () => {}), '');
  await h.session.dispose();
  assert.ok(h.calls.some(call => call[0] === 'stop'));
  assert.equal(h.calls.filter(call => call[0] === 'release').length, 1);
});
test('Stop works when the native method returns undefined during a pending reply', async () => {
  const gate = deferred(); const h = harness({ stopBehavior: 'void', completionGate: gate });
  const reply = h.session.ask('Balance?', facts, [], () => {});
  const stopped = assert.rejects(reply, /stopped/);
  await tick(); await h.session.stop(); await stopped; await h.session.dispose();
  assert.equal(h.calls.filter(call => call[0] === 'release').length, 1);
});
test('native stop throws or rejects without escaping the stream callback or cleanup', async () => {
  for (const stopBehavior of ['throw', 'reject']) {
    const h = harness({ stopBehavior, chunks: [{ token: 'PHP 999 ', content: 'PHP 999 ' }] });
    assert.equal(await h.session.ask('Balance?', facts, [], () => {}), '');
    await h.session.dispose(); await tick();
    assert.equal(h.calls.filter(call => call[0] === 'release').length, 1);
  }
});
