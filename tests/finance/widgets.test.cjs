const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

test('widget prebuild registers three providers once and generates their native resources', async () => {
  const root = path.resolve(__dirname, '../..');
  const directory = path.join(root, 'plugins/kuwenta-widget');
  let manifestMod, fileMod;
  const module = { exports: {} };
  vm.runInNewContext(await fs.readFile(path.join(directory, 'with-kuwenta-widget.js'), 'utf8'), {
    module, __dirname: directory, require(name) {
      if (name === 'expo/config-plugins') return {
        withAndroidManifest(config, callback) { manifestMod = callback; return config; },
        withDangerousMod(config, [, callback]) { fileMod = callback; return config; },
      };
      return require(name);
    },
  });
  module.exports({ android: { package: 'com.iemdomain04.Kuwenta' } });
  const manifest = { modResults: { manifest: { application: [{ receiver: [{ $: { 'android:name': 'UnrelatedReceiver' } }] }] } } };
  manifestMod(manifest); manifestMod(manifest);
  const receivers = manifest.modResults.manifest.application[0].receiver;
  assert.equal(receivers.length, 4);
  assert.equal(receivers[0].$['android:name'], 'UnrelatedReceiver');
  const temporary = await fs.mkdtemp(path.join(root, '.expo/widget-test-'));
  try {
    await fileMod({ modRequest: { platformProjectRoot: temporary } });
    const main = path.join(temporary, 'app/src/main');
    for (const receiver of receivers.slice(1)) {
      assert.equal(receiver.$['android:exported'], 'false');
      const resource = receiver['meta-data'][0].$['android:resource'].replace('@xml/', '');
      const xml = await fs.readFile(path.join(main, 'res/xml', resource + '.xml'), 'utf8');
      assert.match(xml, /updatePeriodMillis="0"/);
      assert.match(xml, /previewImage="@mipmap\/ic_launcher"/);
      const layout = /initialLayout="@layout\/([^"]+)"/.exec(xml)[1];
      await fs.access(path.join(main, 'res/layout', layout + '.xml'));
    }
    for (const file of ['KuwentaQuickWidget.kt', 'KuwentaBalanceWidget.kt']) {
      const source = await fs.readFile(path.join(main, 'java/com/iemdomain04/Kuwenta', file), 'utf8');
      assert.match(source, /^package com\.iemdomain04\.Kuwenta/);
      assert.doesNotMatch(source, /__PACKAGE__/);
    }
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
