const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
async function harness() {
  const root = await fs.mkdtemp(path.resolve('.expo/assistant-package-'));
  const folder = path.join(root, 'assets/models'); await fs.mkdir(folder, { recursive: true });
  const bytes = Buffer.from('GGUF test model');
  const model = { file: 'test.gguf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  let android, ios; const resources = [];
  const module = { exports: {} };
  vm.runInNewContext(await fs.readFile('plugins/with-assistant-model.js', 'utf8'), { module, require(name) {
    if (name === 'expo/config-plugins') return { withDangerousMod(config, [, callback]) { android = callback; return config; }, withXcodeProject(config, callback) { ios = callback; return config; }, IOSConfig: { XcodeUtils: { ensureGroupRecursively() {}, addResourceFileToGroup(options) { resources.push(options); } } } };
    if (name.endsWith('model.json')) return model;
    return require(name);
  } });
  module.exports({});
  return { root, folder, bytes, model, android, ios, resources, verify: module.exports.verifyAssistantModel };
}
test('prebuild rejects missing, truncated and tampered model files', async () => {
  const h = await harness();
  try {
    await assert.rejects(h.verify(h.root), /missing or incomplete/);
    await fs.writeFile(path.join(h.folder, h.model.file), 'short');
    await assert.rejects(h.verify(h.root), /missing or incomplete/);
    await fs.writeFile(path.join(h.folder, h.model.file), Buffer.alloc(h.bytes.length));
    await assert.rejects(h.verify(h.root), /checksum/);
  } finally { await fs.rm(h.root, { recursive: true, force: true }); }
});
test('verified native resource and license are packaged for Android and iOS', async () => {
  const h = await harness();
  try {
    await fs.writeFile(path.join(h.folder, h.model.file), h.bytes);
    await fs.writeFile(path.join(h.folder, 'Qwen3-LICENSE.txt'), 'model license');
    const android = path.join(h.root, 'android');
    await h.android({ modRequest: { projectRoot: h.root, platformProjectRoot: android } });
    assert.deepEqual(await fs.readFile(path.join(android, 'app/src/main/assets', h.model.file)), h.bytes);
    assert.equal(await fs.readFile(path.join(android, 'app/src/main/assets/Qwen3-LICENSE.txt'), 'utf8'), 'model license');
    await h.ios({ modResults: {}, modRequest: { projectRoot: h.root, platformProjectRoot: path.join(h.root, 'ios') } });
    assert.equal(h.resources.length, 2);
    assert.ok(h.resources.every(resource => resource.isBuildFile && resource.groupName === 'Resources'));
  } finally { await fs.rm(h.root, { recursive: true, force: true }); }
});
