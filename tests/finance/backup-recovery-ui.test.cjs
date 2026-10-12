const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
const { cash } = require('./fixtures.cjs');
const source = ts.transpileModule(fs.readFileSync('src/features/finance/components/backup-import-preview.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function harness({ legacy = false, recovery = true, failRestore = false } = {}) {
  const hooks = []; let cursor = 0, confirmation, restored = 0, unlocked = 0;
  const notices = [];
  const backup = { accounts: [cash], transactions: [], exportedAt: '2026-10-12T00:00:00.000Z' };
  const state = initial => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks[index], value => { hooks[index] = value; }];
  };
  const jsx = (type, props) => ({ type, props });
  const sandbox = { Error, exports: {}, require(name) {
    if (name === 'react') return { useState: state, useRef: value => state(() => ({ current: value }))[0], useEffect() {} };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === './confirmation') return { useConfirmation: () => ({ alert: (title, message, buttons, options) => { confirmation = { title, message, buttons, options }; } }) };
    if (name.endsWith('/field-error')) return { FieldError: 'FieldError' };
    if (name === 'react-native') return { TextInput: 'Input', Keyboard: { dismiss() {} } };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({ accent: '#06633E' }) };
    if (name === './ui') return { ActionButton: 'Button' };
    if (name === '../backup-files') return { pickBackupFile: async () => ({ name: 'backup.json', json: '{}', backup: legacy ? null : backup }) };
    if (name === '../encrypted-backup') return { validateBackupPassword() {}, decryptBackup: async (_, password) => { unlocked++; assert.equal(password, 'password123'); return backup; } };
    if (name === '../backup') return { previewBackup: () => ({ accountCount: 1, transactionCount: 0, budgetCount: 0, goalCount: 0, cashBalance: 100000 }) };
    if (name === '../calculations') return { calculateCurrentMoney: () => ({ totalMoney: 100000 }) };
    if (name === '../money') return { formatMoney: amount => String(amount) };
    if (name === '../dates') return { philippineDateTime: () => ({ transactionDate: '2026-10-12', transactionTime: '08:00:00' }) };
    throw new Error('Unexpected dependency: ' + name);
  } };
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0; const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node?.props) return;
      nodes.push(node); walk(node.props.children);
    }
    walk(sandbox.exports.BackupImportPreview({ recovery, onRestore: async payload => {
      assert.equal(payload, backup);
      if (failRestore) throw new Error('Restore failed; current records preserved.');
      restored++;
    }, onNotice: message => { notices.push(message); } }));
    return { button: label => nodes.find(node => node.props.label === label), input: () => nodes.find(node => node.type === 'Input') };
  }
  return { render, notices, confirmation: () => confirmation, restored: () => restored, unlocked: () => unlocked };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
for (const legacy of [false, true]) test((legacy ? 'legacy protected' : 'password-free') + ' startup recovery requires preview and explicit confirmation before replacement', async () => {
  const app = harness({ legacy });
  app.render().button('Choose backup file').props.onPress(); await settle();
  if (legacy) {
    app.render().input().props.onChangeText('password123');
    app.render().button('Unlock and preview').props.onPress(); await settle();
    assert.equal(app.unlocked(), 1);
  } else {
    assert.equal(app.render().input(), undefined);
    assert.equal(app.unlocked(), 0);
  }
  assert.equal(app.restored(), 0);
  app.render().button('Restore this backup').props.onPress();
  assert.equal(app.confirmation().title, 'Recover records from this backup?');
  assert.ok(app.confirmation().message.includes('inaccessible database will be kept'));
  app.confirmation().buttons.find(button => button.text === 'Cancel').onPress();
  assert.equal(app.restored(), 0);
  app.render().button('Restore this backup').props.onPress();
  app.confirmation().buttons.find(button => button.text === 'Restore').onPress();
  await settle(); assert.equal(app.restored(), 1);
});
test('normal import previews immediately and cancellation does not replace records', async () => {
  const app = harness({ recovery: false });
  app.render().button('Choose backup file').props.onPress(); await settle();
  assert.equal(app.render().input(), undefined);
  app.render().button('Replace current records').props.onPress();
  assert.equal(app.confirmation().title, 'Replace current records?');
  assert.match(app.confirmation().message, /after its export will be lost/);
  app.confirmation().buttons.find(button => button.text === 'Cancel').onPress();
  app.render().button('Close preview').props.onPress();
  assert.equal(app.render().button('Replace current records'), undefined);
  assert.equal(app.restored(), 0);
});
test('failed restore preserves the preview and allows retry without reporting success', async () => {
  const app = harness({ recovery: false, failRestore: true });
  app.render().button('Choose backup file').props.onPress(); await settle();
  app.render().button('Replace current records').props.onPress();
  app.confirmation().buttons.find(button => button.text === 'Replace').onPress();
  await settle();
  assert.equal(app.restored(), 0);
  assert.deepEqual(app.notices, ['Restore failed; current records preserved.']);
  assert.equal(app.render().button('Replace current records').props.disabled, false);
});
