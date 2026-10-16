const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('assistant message renders real bold nested text and wrapping list rows', () => {
  const jsx = (type, props) => ({ type, props });
  const sandbox = { exports: {}, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View' };
    if (name === '@/components/themed-text') return { ThemedText: 'Text' };
    if (name === '../assistant-format') return require('../../.expo/finance-tests/assistant-format.js');
    throw new Error('Unexpected dependency ' + name);
  } };
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/components/assistant-message.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, sandbox);
  const tree = sandbox.exports.AssistantMessage({ text: '**PHP 200 left**\n\n- Review 2026-10' });
  const nodes = [], strings = [];
  function walk(node) {
    if (typeof node === 'string') { strings.push(node); return; }
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node?.props) return;
    nodes.push(node); walk(node.props.children);
  }
  walk(tree);
  assert.ok(nodes.some(node => node.props.type === 'smallBold' && node.props.children === 'PHP 200 left'));
  assert.ok(nodes.some(node => node.props.selectable && node.props.style.flex === 1));
  assert.ok(strings.some(text => text === 'Review October 2026'));
  assert.ok(strings.every(text => !text.includes('**')));
});
