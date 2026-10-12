const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup({ runtime = 'storeClient', failInitialization = false, failEncrypted = false } = {}) {
  const events = [];
  const db = {
    execAsync: async () => events.push('initialize-pragmas'),
    closeAsync: async () => events.push('close-test'),
  };
  const encryptedDb = {};
  const dependencies = {
    './migrations': { migrateDatabase: async () => {
      events.push('migrate');
      if (failInitialization) { failInitialization = false; throw new Error('migration failed'); }
    } },
    'expo-constants': { __esModule: true, default: { executionEnvironment: runtime }, ExecutionEnvironment: { StoreClient: 'storeClient' } },
    'expo-sqlite': { openDatabaseAsync: async name => { events.push('open:' + name); return db; } },
    './encrypted-database': { openEncryptedDatabase: async () => {
      events.push('open-encrypted');
      if (failEncrypted) throw new Error('key unavailable');
      return encryptedDb;
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(readFileSync('.expo/finance-tests/storage/database.js', 'utf8'), {
    exports: module.exports, module, require: name => {
      if (name === './encrypted-database') events.push('load-encryption');
      assert.ok(dependencies[name], 'unexpected module: ' + name);
      return dependencies[name];
    },
  });
  return { open: module.exports.openFinanceDatabase, events, db, encryptedDb };
}

test('Expo Go opens and initializes only a separate plaintext test database', async () => {
  const state = setup();
  assert.equal(await state.open(), state.db);
  assert.deepEqual(state.events, ['open:kuwenta-expo-go-test.db', 'initialize-pragmas', 'migrate']);
});

test('installed apps and development builds always use encrypted storage', async () => {
  for (const runtime of ['standalone', 'bare', undefined]) {
    const state = setup({ runtime: runtime === undefined ? null : runtime });
    assert.equal(await state.open(), state.encryptedDb);
    assert.deepEqual(state.events, ['load-encryption', 'open-encrypted']);
  }
});

test('native encryption errors never fall back to a plaintext database', async () => {
  const state = setup({ runtime: 'bare', failEncrypted: true });
  await assert.rejects(state.open(), /key unavailable/);
  assert.deepEqual(state.events, ['load-encryption', 'open-encrypted']);
});

test('failed Expo Go initialization closes the connection and permits retry without deleting data', async () => {
  const state = setup({ failInitialization: true });
  await assert.rejects(state.open(), /migration failed/);
  assert.equal(state.events.at(-1), 'close-test');
  assert.equal(await state.open(), state.db);
  assert.equal(state.events.filter(event => event === 'open:kuwenta-expo-go-test.db').length, 2);
});

test('concurrent Expo Go opens serialize initialization and reuse the same test filename', async () => {
  const state = setup();
  await Promise.all([state.open(), state.open()]);
  assert.deepEqual(state.events, [
    'open:kuwenta-expo-go-test.db', 'initialize-pragmas', 'migrate',
    'open:kuwenta-expo-go-test.db', 'initialize-pragmas', 'migrate',
  ]);
});
