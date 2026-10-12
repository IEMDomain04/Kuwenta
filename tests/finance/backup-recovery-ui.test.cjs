const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
const { cash } = require('./fixtures.cjs');

test('startup backup recovery requires unlocking, preview, and explicit confirmation before replacement', async () => {
  const hooks = []; let cursor = 0, confirmation, restored = 0;
  const backup = { accounts: [cash], transactions: [], exportedAt: '2026-10-12T00:00:00.000Z' };
  const state = initial => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks[index], value => { hooks[index] = value; }];
  };
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react') return { useState: state, useRef: value => state(() => ({ current: value }))[0], useEffect() {} };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { TextInput: 'Input', Keyboard: { dismiss() {} }, Alert: { alert: (title, message, buttons) => { confirmation = { title, message, buttons }; } } };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({ accent: '#06633E' }) };
    if (name === './ui') return { ActionButton: 'Button' };
    if (name === '../encrypted-backup') return { pickBackupFile: async () => ({ name: 'backup.kuwenta', json: '{}' }), validateBackupPassword() {}, decryptBackup: async (_, password) => { assert.equal(password, 'password123'); return backup; } };
    if (name === '../backup') return { previewBackup: () => ({ accountCount: 1, cashBalance: 0 }) };
    if (name === '../money') return { formatMoney: amount => String(amount) };
    if (name === '../dates') return { philippineDateTime: () => ({ transactionDate: '2026-10-12', transactionTime: '08:00:00' }) };
    throw new Error('Unexpected dependency: ' + name);
  } };
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/components/backup-import-preview.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, sandbox);
  function render() {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node?.props) return;
      nodes.push(node); walk(node.props.children);
    }
    walk(sandbox.exports.BackupImportPreview({ recovery: true, onRestore: async payload => { assert.equal(payload, backup); restored++; }, onNotice: message => { throw new Error(message); } }));
    return { button: label => nodes.find(node => node.props.label === label), input: () => nodes.find(node => node.type === 'Input') };
  }
  const settle = () => new Promise(resolve => setImmediate(resolve));
  render().button('Choose backup file').props.onPress(); await settle();
  render().input().props.onChangeText('password123');
  render().button('Unlock and preview').props.onPress(); await settle();
  assert.equal(restored, 0);
  render().button('Restore this backup').props.onPress();
  assert.equal(confirmation.title, 'Recover records from this backup?');
  assert.ok(confirmation.message.includes('inaccessible database will be kept'));
  assert.equal(restored, 0);
  confirmation.buttons.find(button => button.text === 'Cancel').onPress();
  assert.equal(restored, 0);
  render().button('Restore this backup').props.onPress();
  confirmation.buttons.find(button => button.text === 'Restore backup').onPress();
  await settle(); assert.equal(restored, 1);
});
