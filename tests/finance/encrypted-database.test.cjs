const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup({ existing = false, legacy = false, key = 'a'.repeat(64), cipher = true, mismatch = false, integrity = 'ok', failStore = false, moveDelay = 0, failMove = false, sidecarsOnly = false, failDeleteOnce = false, encryptedJournalOnly = false, directory = '/private', expoGo = false } = {}) {
  const events = [];
  const fileUris = []; let keyReads = 0;
  const files = new Set([...(existing ? ['kuwenta-encrypted.db'] : []), ...(legacy ? ['kuwenta.db', 'kuwenta.db-wal', 'kuwenta.db-shm'] : []), ...(sidecarsOnly ? ['kuwenta.db-wal', 'kuwenta.db-shm'] : []), ...(encryptedJournalOnly ? ['kuwenta-encrypted.db-wal'] : [])]);
  let deleteFailed = false;
  class File {
    constructor(directory, name) {
      assert.match(directory, /^file:\/\/\//, 'native File needs an absolute file URI');
      this.name = name; this.uri = directory.replace(/\/$/, '') + '/' + name;
      fileUris.push(this.uri);
    }
    get exists() { return files.has(this.name); }
    delete() { if (failDeleteOnce && !deleteFailed) { deleteFailed = true; throw new Error('busy journal'); } events.push('delete:' + this.name); files.delete(this.name); }
    async move(destination) { events.push('move-start'); await new Promise(resolve => setTimeout(resolve, moveDelay)); if (failMove) throw new Error('move failed'); if (files.has(destination.name)) throw new Error('destination exists'); events.push('publish'); files.delete(this.name); files.add(destination.name); }
  }
  const module = { exports: {} };
  const dependencies = {
    'expo-constants': { __esModule: true, default: { executionEnvironment: expoGo ? 'storeClient' : 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } },
    'expo-file-system': { File, Directory: class { constructor(uri) { assert.match(uri, /^file:\/\/\//); } get exists() { return files.size > 0; } list() { return [...files].map(name => ({ name })); } } },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1, getItemAsync: async () => { keyReads++; return key; }, setItemAsync: async (_, value) => { if (failStore) throw new Error('locked'); key = value; events.push('store-key'); } },
    'expo-crypto': { getRandomBytesAsync: async size => new Uint8Array(size).fill(1) },
    './database': { initializeDatabase: async () => events.push('initialize'), DatabaseRecoveryError: class extends Error {} },
    '../backup': { parseBackup: json => { const backup = JSON.parse(json); if (!backup.accounts) throw new Error('invalid backup'); return backup; } },
    './backup': { restoreBackup: async () => events.push('restore-backup') },
    'expo-sqlite': {
      defaultDatabaseDirectory: directory,
      deleteDatabaseAsync: async name => { events.push('delete:' + name); files.delete(name); },
      openDatabaseAsync: async name => {
        events.push('open:' + name); files.add(name);
        return {
          execAsync: async sql => events.push(sql.startsWith('PRAGMA key') ? 'key' : sql),
          runAsync: async (sql, path) => { assert.equal(path, (directory.startsWith('file://') ? decodeURIComponent(directory.slice(7)) : directory).replace(/\/$/, '') + '/kuwenta.db'); events.push('attach'); },
          getFirstAsync: async sql => {
            if (sql === 'PRAGMA cipher_version') return cipher ? { cipher_version: '4' } : null;
            if (sql === 'PRAGMA legacy.user_version') return { user_version: 9 };
            if (sql.includes('sqlcipher_export')) { events.push('export'); return {}; }
            if (sql.includes('EXCEPT')) return mismatch ? { difference: 1 } : null;
            if (sql === 'PRAGMA integrity_check') { events.push('verify'); return { integrity_check: integrity }; }
            return {};
          },
          getAllAsync: async sql => sql.includes('sqlite_master') ? [{ name: 'accounts' }] : [],
          closeAsync: async () => events.push('close:' + name),
        };
      },
    },
  };
  vm.runInNewContext(readFileSync('.expo/finance-tests/storage/encrypted-database.js', 'utf8'), {
    setTimeout, exports: module.exports, module, require: name => { if (!dependencies[name]) throw new Error(name); return dependencies[name]; },
  });
  return { open: module.exports.openEncryptedDatabase, recover: module.exports.recoverEncryptedDatabase, events, files, fileUris, keyReads: () => keyReads, saved: () => key };
}

test('fresh install stores a random key before creating and publishing the verified database', async () => {
  const state = setup({ key: null }); await state.open();
  assert.ok(state.events.indexOf('store-key') < state.events.indexOf('open:kuwenta-encrypting.db'));
  assert.ok(state.events.indexOf('verify') < state.events.indexOf('publish'));
});
test('migration verifies and reopens the encrypted copy before removing plaintext and its sidecars', async () => {
  const state = setup({ legacy: true }); await state.open();
  assert.ok(state.events.indexOf('export') < state.events.indexOf('verify'));
  assert.ok(state.events.indexOf('open:kuwenta-encrypted.db') < state.events.indexOf('delete:kuwenta.db'));
  assert.ok(state.events.includes('PRAGMA user_version = 9;'));
  for (const name of ['kuwenta.db', 'kuwenta.db-wal', 'kuwenta.db-shm']) assert.equal(state.files.has(name), false);
});
test('mismatched or corrupt copies never replace or delete the original', async () => {
  for (const options of [{ mismatch: true }, { integrity: 'corrupt' }]) {
    const state = setup({ legacy: true, ...options });
    await assert.rejects(state.open(), /original database is preserved/);
    assert.ok(state.files.has('kuwenta.db')); assert.ok(!state.events.includes('publish'));
  }
});
test('missing or invalid keys preserve existing encrypted records without replacement', async () => {
  for (const key of [null, 'bad']) {
    const state = setup({ existing: true, key });
    await assert.rejects(state.open(), /key/);
    assert.equal(state.events.length, 0);
  }
});
test('unsupported native builds fail closed without deleting the legacy database', async () => {
  const state = setup({ legacy: true, cipher: false });
  await assert.rejects(state.open(), /updated Kuwenta APK/);
  assert.ok(state.files.has('kuwenta.db')); assert.ok(!state.events.includes('publish'));
});
test('an unavailable secure store prevents creating a database', async () => {
  const state = setup({ key: null, failStore: true });
  await assert.rejects(state.open(), /locked/); assert.equal(state.files.size, 0);
});
test('ordinary reopening uses the existing encrypted file without exporting or migrating again', async () => {
  const state = setup({ existing: true }); await state.open();
  assert.ok(!state.events.includes('export')); assert.ok(!state.events.includes('verify'));
  assert.equal(state.events[0], 'open:kuwenta-encrypted.db'); assert.equal(state.events[1], 'key');
});

test('write transactions use a keyed isolated connection with foreign keys and rollback on failure', async () => {
  const state = setup({ existing: true }); const db = await state.open();
  state.events.length = 0;
  await assert.rejects(db.withExclusiveTransactionAsync(async () => { throw new Error('failed write'); }), /failed write/);
  assert.deepEqual(state.events.slice(0, 3), ['open:kuwenta-encrypted.db', 'key', 'PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;']);
  assert.ok(state.events.includes('ROLLBACK')); assert.ok(!state.events.includes('COMMIT'));
  assert.equal(state.events.at(-1), 'close:kuwenta-encrypted.db');
  state.events.length = 0;
  await db.withExclusiveTransactionAsync(async transaction => { assert.notEqual(transaction, db); });
  assert.ok(state.events.includes('COMMIT')); assert.ok(!state.events.includes('ROLLBACK'));
});

test('Android backup rules exclude cloud and device transfer, including files and preferences', async () => {
  const fs = require('node:fs'); const path = require('node:path');
  const directory = fs.mkdtempSync(path.join('.expo', 'private-backup-test-'));
  let manifestMod, fileMod;
  const module = { exports: {} };
  const app = { $: {} };
  vm.runInNewContext(fs.readFileSync('plugins/with-private-backup.js', 'utf8'), {
    module, require: name => name === 'expo/config-plugins' ? {
      withAndroidManifest: (config, callback) => { manifestMod = callback; return config; },
      withDangerousMod: (config, [, callback]) => { fileMod = callback; return config; },
      AndroidConfig: { Manifest: { getMainApplicationOrThrow: () => app } },
    } : require(name),
  });
  try {
    module.exports({}); manifestMod({ modResults: {} });
    await fileMod({ modRequest: { platformProjectRoot: directory } });
    assert.equal(app.$['android:allowBackup'], 'false');
    const xml = fs.readFileSync(path.join(directory, 'app/src/main/res/xml/kuwenta_extraction_rules.xml'), 'utf8');
    for (const section of ['cloud-backup', 'device-transfer']) {
      const content = xml.split('<' + section + '>')[1].split('</' + section + '>')[0];
      for (const domain of ['root', 'file', 'database', 'sharedpref', 'device_root', 'device_file', 'device_database', 'device_sharedpref']) {
        assert.ok(content.includes('domain="' + domain + '" path="."'));
      }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a delayed file move completes before opening the destination or deleting the original', async () => {
  const state = setup({ legacy: true, moveDelay: 30 }); await state.open();
  assert.ok(state.events.indexOf('publish') < state.events.indexOf('open:kuwenta-encrypted.db'));
  assert.ok(state.events.indexOf('publish') < state.events.indexOf('delete:kuwenta.db'));
});
test('a rejected file move preserves the original and never opens an empty destination', async () => {
  const state = setup({ legacy: true, failMove: true });
  await assert.rejects(state.open(), /original database is preserved/);
  assert.ok(state.files.has('kuwenta.db')); assert.ok(!state.events.includes('open:kuwenta-encrypted.db'));
});
test('leftover plaintext journals are cleaned even when the main database is already gone', async () => {
  const state = setup({ existing: true, sidecarsOnly: true }); await state.open();
  assert.ok(!state.files.has('kuwenta.db-wal')); assert.ok(!state.files.has('kuwenta.db-shm'));
});
test('a journal deletion failure is retried on the next open after the main file was removed', async () => {
  const state = setup({ existing: true, legacy: true, failDeleteOnce: true });
  await assert.rejects(state.open(), /database is preserved/);
  assert.ok(!state.files.has('kuwenta.db')); assert.ok(state.files.has('kuwenta.db-wal'));
  await state.open(); assert.ok(!state.files.has('kuwenta.db-wal'));
});
test('recovery restores and verifies a separate database before selecting its key, preserving the original', async () => {
  const state = setup({ existing: true, key: null });
  await state.recover({ accounts: [] });
  const entry = JSON.parse(state.saved());
  assert.match(entry.database, /^kuwenta-recovered-[a-f0-9]{32}\.db$/);
  assert.equal(entry.key.length, 64);
  assert.ok(state.events.indexOf('restore-backup') < state.events.indexOf('store-key'));
  assert.ok(state.events.filter(event => event === 'verify').length === 2);
  assert.ok(state.files.has('kuwenta-encrypted.db'));
  state.events.length = 0; await state.open();
  assert.equal(state.events[0], 'open:' + entry.database);
});
test('a failed recovery key save preserves the original and never selects the new database', async () => {
  const state = setup({ existing: true, key: null, failStore: true });
  await assert.rejects(state.recover({ accounts: [] }), /locked/);
  assert.equal(state.saved(), null); assert.ok(state.files.has('kuwenta-encrypted.db'));
});
test('an invalid backup never opens a recovery database or changes its key', async () => {
  const state = setup({ existing: true, key: null });
  await assert.rejects(state.recover({ bad: true }), /invalid backup/);
  assert.equal(state.events.length, 0); assert.equal(state.saved(), null);
});
test('an invalid recovery descriptor preserves all files without opening a database', async () => {
  const state = setup({ existing: true, key: JSON.stringify({ database: '../outside.db', key: 'a'.repeat(64) }) });
  await assert.rejects(state.open(), /security key is invalid/); assert.equal(state.events.length, 0);
});

test('orphaned encrypted journals never cause a silent fresh database when the main file is missing', async () => {
  for (const key of [null, 'a'.repeat(64)]) {
    const state = setup({ encryptedJournalOnly: true, key });
    await assert.rejects(state.open(), /security key|secured database/);
    assert.equal(state.events.length, 0);
    assert.ok(state.files.has('kuwenta-encrypted.db-wal'));
  }
});

test('Expo Go stops before file inspection, key access, or migration, preserving all records', async () => {
  const state = setup({ legacy: true, existing: true, key: null, expoGo: true });
  await assert.rejects(state.open(), /Kuwenta APK or development build instead of Expo Go/);
  await assert.rejects(state.recover({ accounts: [] }), /instead of Expo Go/);
  assert.equal(state.keyReads(), 0);
  assert.equal(state.fileUris.length, 0);
  assert.equal(state.events.length, 0);
  assert.equal(state.saved(), null);
  assert.ok(state.files.has('kuwenta.db'));
  assert.ok(state.files.has('kuwenta-encrypted.db'));
});
test('raw Android paths and existing iOS file URIs point to the same database location', async () => {
  for (const directory of ['/private', 'file:///private', '/private/Kuwenta space % # \u20b1', 'file:///private/Kuwenta%20space%20%25%20%23%20%E2%82%B1/']) {
    const state = setup({ directory, legacy: true });
    await state.open();
    const path = (directory.startsWith('file://') ? decodeURIComponent(directory.slice(7)) : directory).replace(/\/$/, '');
    assert.ok(state.fileUris.every(uri => decodeURIComponent(uri.slice(7)).startsWith(path + '/')));
    assert.ok(state.events.includes('attach'));
    assert.ok(state.events.includes('publish'));
  }
});
