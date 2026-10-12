const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const { cash, record } = require('./fixtures.cjs');
const { serializeBackup, parseBackup } = require('../../.expo/finance-tests/backup.js');
const originalLoad = Module._load;
let native = null, importedKey, decryptedBytes, derivations = 0;
Module._load = function(name, ...args) {
  if (name === 'expo') return { requireOptionalNativeModule: () => native };
  if (name === 'expo-crypto') return {
    AESEncryptionKey: { import: async bytes => { importedKey = bytes; return Buffer.from(bytes); } },
    AESSealedData: { fromCombined: base64 => Buffer.from(base64, 'base64') },
    aesDecryptAsync: async (combined, key, options) => {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, combined.subarray(0, 12));
      decipher.setAAD(Buffer.from(options.additionalData));
      decipher.setAuthTag(combined.subarray(-16));
      decryptedBytes = new Uint8Array(Buffer.concat([decipher.update(combined.subarray(12, -16)), decipher.final()]));
      return decryptedBytes;
    },
  };
  return originalLoad.call(this, name, ...args);
};
after(() => { Module._load = originalLoad; });
const { decryptBackup, parseEncryptedBackup, validateBackupPassword } = require('../../.expo/finance-tests/encrypted-backup.js');
const password = 'A long test passphrase';
const json = serializeBackup(cash, [record({ notes: 'Meals' })], '2026-10-09T06:35:00.000Z');
function protectedFile(plaintext = json, entered = password) {
  const salt = crypto.randomBytes(16), nonce = crypto.randomBytes(12);
  const header = { format: 'kuwenta-encrypted', version: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-HMAC-SHA256', iterations: 600000, salt: salt.toString('hex') };
  const key = crypto.pbkdf2Sync(entered, salt, 600000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const sealed = Buffer.concat([nonce, cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ ...header, sealedData: sealed.toString('base64') });
}
const envelope = protectedFile();
test('old protected backups retain their original encryption settings and exact records', async () => {
  const result = await decryptBackup(envelope, password);
  assert.deepEqual(result, parseBackup(json));
  assert.ok(importedKey.every(byte => byte === 0));
  assert.ok(decryptedBytes.every(byte => byte === 0));
});
test('reordered envelope keys still authenticate against canonical metadata', async () => {
  const reversed = Object.fromEntries(Object.entries(JSON.parse(envelope)).reverse());
  assert.deepEqual(await decryptBackup(JSON.stringify(reversed), password), parseBackup(json));
});
test('incorrect passwords and altered ciphertext cannot restore records', async () => {
  await assert.rejects(() => decryptBackup(envelope, 'Wrong passphrase'), /incorrect or the file has been altered/);
  const altered = JSON.parse(envelope), bytes = Buffer.from(altered.sealedData, 'base64');
  bytes[12] ^= 1; altered.sealedData = bytes.toString('base64');
  await assert.rejects(() => decryptBackup(JSON.stringify(altered), password), /incorrect or the file has been altered/);
  assert.ok(importedKey.every(byte => byte === 0));
});
test('invalid settings fail before native derivation or preview', async () => {
  native = { deriveKey: async () => { derivations++; throw new Error('Must not derive'); } };
  try {
    for (const patch of [{ version: 2 }, { iterations: 1 }, { salt: '00' }, { sealedData: 'abc' }, { unexpected: true }]) {
      await assert.rejects(() => decryptBackup(JSON.stringify({ ...JSON.parse(envelope), ...patch }), password));
    }
    assert.equal(derivations, 0);
    for (const invalid of ['null', '[]', '{', '{}']) assert.throws(() => parseEncryptedBackup(invalid));
  } finally { native = null; }
});
test('authenticated invalid records and invalid UTF-8 are rejected and plaintext is wiped', async () => {
  const invalid = JSON.parse(json); invalid.transactions[0].amount = -1;
  await assert.rejects(() => decryptBackup(protectedFile(JSON.stringify(invalid)), password), /positive safe integer/);
  assert.ok(decryptedBytes.every(byte => byte === 0));
  await assert.rejects(() => decryptBackup(protectedFile(Buffer.from([0xff])), password));
  assert.ok(decryptedBytes.every(byte => byte === 0));
});
test('native acceleration decrypts existing backups including Unicode passwords', async () => {
  native = { deriveKey: async (value, salt, iterations) => crypto.pbkdf2Sync(Buffer.from(value, 'utf8'), Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex') };
  try {
    const unicode = 'Long passphrase \u20b1 \ud83d\udcb0';
    assert.deepEqual(await decryptBackup(protectedFile(json, unicode), unicode), parseBackup(json));
    assert.deepEqual(await decryptBackup(envelope, password), parseBackup(json));
  } finally { native = null; }
});
test('native errors and malformed keys cannot produce a backup preview', async () => {
  native = { deriveKey: async () => '00' };
  try {
    await assert.rejects(() => decryptBackup(envelope, password), /Could not unlock/);
    native = { deriveKey: async () => { throw new Error('Native derivation failed'); } };
    await assert.rejects(() => decryptBackup(envelope, password), /Native derivation failed/);
  } finally { native = null; }
});
test('password checks apply only to legacy files and their original length remains supported', () => {
  assert.doesNotThrow(() => validateBackupPassword('1234abcd'));
  assert.throws(() => validateBackupPassword('short'));
});
