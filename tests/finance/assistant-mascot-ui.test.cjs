const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(reduced = false) {
  const hooks = [], effects = [], loops = [], timings = []; let cursor = 0, listener, removed = false;
  const state = initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = value; }]; };
  const jsx = (type, props) => ({ type, props });
  const animated = { View: 'AnimatedView', Value: class { setValue() {} interpolate() { return 0; } }, timing(value, options) { timings.push(options); return {}; }, sequence: steps => steps, loop() { const loop = { started: 0, stopped: 0, start() { this.started++; }, stop() { this.stopped++; } }; loops.push(loop); return loop; } };
  const sandbox = { exports: {}, require(name) {
    if (name === 'react') return { useState: state, useEffect(fn, deps) { const i = cursor++; const old = hooks[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) { hooks[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = fn(); }); } } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', Animated: animated, AccessibilityInfo: { isReduceMotionEnabled: async () => reduced, addEventListener(event, fn) { assert.equal(event, 'reduceMotionChanged'); listener = fn; return { remove() { removed = true; } }; } } };
    if (name === 'expo-image') return { Image: 'Image' };
    if (name === '@/hooks/use-theme') return { useTheme: () => ({ accent: '#06633E' }) };
    if (name.endsWith('.png')) return name;
    throw new Error('Unexpected dependency: ' + name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/features/finance/components/assistant-mascot.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, sandbox);
  function render(props = { thinking: true, animated: true }) { cursor = 0; const tree = sandbox.exports.AssistantMascot(props); effects.splice(0).forEach(fn => fn()); return tree; }
  return { loops, timings, render, changeMotion(value) { listener(value); }, get removed() { return removed; }, unmount() { hooks.forEach(hook => hook?.cleanup?.()); } };
}
test('thinking animation uses the native driver and stops when reduced motion is enabled or unmounted', async () => {
  const h = harness(); h.render(); await tick(); h.render();
  assert.equal(h.loops.length, 1); assert.equal(h.loops[0].started, 1);
  assert.ok(h.timings.every(options => options.useNativeDriver && options.isInteraction === false));
  h.changeMotion(true); h.render(); assert.equal(h.loops[0].stopped, 1);
  h.changeMotion(false); h.render(); assert.equal(h.loops.length, 2);
  h.unmount(); assert.equal(h.loops[1].stopped, 1); assert.equal(h.removed, true);
});
test('reduced motion keeps the mascot and status dots visible without starting an animation', async () => {
  const h = harness(true); h.render(); await tick(); const tree = h.render();
  assert.equal(h.loops.length, 0); assert.ok(tree.props.children[1]); h.unmount();
});
test('idle and concern mascots do not animate', async () => {
  const h = harness(); h.render({ concerned: true }); await tick(); const tree = h.render({ concerned: true });
  assert.equal(h.loops.length, 0); assert.ok(tree.props.children[0].props.children.props.source.endsWith('concerned.png')); h.unmount();
});
