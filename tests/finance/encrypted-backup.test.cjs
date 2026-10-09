const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const { cash, record } = require('./fixtures.cjs');
const { serializeBackup, parseBackup } = require('../../.expo/finance-tests/backup.js');

// Exercise the Expo API boundary with standard Node AES-GCM, not native phone code.
const originalLoad = Module._load;
const files = [];
let available = true;
let sharingFails = false;
let writingFails = false;
let encryptionFails = false;
let cryptoCalls = 0;
let importedKey;
const expoCrypto = {
  getRandomBytesAsync: async (size) => { cryptoCalls++; return crypto.randomBytes(size); },
  randomUUID: crypto.randomUUID,
  AESEncryptionKey: {
    import: async (bytes) => { importedKey = bytes; return Buffer.from(bytes); },
  },
  aesEncryptAsync: async (plaintext, key, options) => {
    if (encryptionFails) throw new Error('Encryption failed');
    assert.equal(options.nonce.length, 12);
    assert.equal(options.tagLength, 16);
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(options.additionalData));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const combined = Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]);
    return { combined: async (encoding) => {
      assert.equal(encoding, 'base64');
      return combined.toString('base64');
    } };
  },
};
class File {
  constructor(directory, filename) {
    this.uri = directory + '/' + filename;
    this.exists = false;
    this.deleted = false;
    files.push(this);
  }
  create() { this.exists = true; }
  write(value) {
    if (writingFails) throw new Error('Write failed');
    this.content = value;
  }
  delete() { this.exists = false; this.deleted = true; }
}
Module._load = function(name, ...args) {
  if (name === 'expo-crypto') return expoCrypto;
  if (name === 'expo-file-system') return { File, Paths: { cache: 'cache' } };
  if (name === 'expo-sharing') return {
    isAvailableAsync: async () => available,
    shareAsync: async (uri, options) => {
      const file = files.find((file) => file.uri === uri);
      assert.equal(file.exists, true);
      assert.equal(options.mimeType, 'application/octet-stream');
      assert.equal(JSON.parse(file.content).format, 'kuwenta-encrypted');
      if (sharingFails) throw new Error('Share failed');
    },
  };
  return originalLoad.call(this, name, ...args);
};
after(() => { Module._load = originalLoad; });
const { encryptBackup, shareEncryptedBackup, validateBackupPassword, BACKUP_KEY_ITERATIONS } =
  require('../../.expo/finance-tests/encrypted-backup.js');
const password = 'A long test passphrase 🔑';
const json = serializeBackup(cash, [record({ notes: 'Lunch ₱120 🍜' })], '2026-10-09T06:35:00.000Z');

function decrypt(envelope, enteredPassword) {
  const { sealedData, ...header } = envelope;
  const key = crypto.pbkdf2Sync(enteredPassword, Buffer.from(header.salt, 'hex'), header.iterations, 32, 'sha256');
  const combined = Buffer.from(sealedData, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, combined.subarray(0, 12));
  decipher.setAAD(Buffer.from(JSON.stringify(header)));
  decipher.setAuthTag(combined.subarray(-16));
  return Buffer.concat([decipher.update(combined.subarray(12, -16)), decipher.final()]).toString('utf8');
}

test('encrypted envelope interoperates with standard AES-GCM and preserves Unicode financial data', async () => {
  const encrypted = await encryptBackup(json, password);
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.iterations, 600000);
  assert.equal(BACKUP_KEY_ITERATIONS, 600000);
  assert.match(envelope.salt, /^[a-f0-9]{32}$/);
  assert.equal(decrypt(envelope, password), json);
  assert.deepEqual(parseBackup(decrypt(envelope, password)).accounts, [cash]);
  assert.equal(encrypted.includes('Lunch'), false);
  assert.equal(encrypted.includes(password), false);
  assert.equal(encrypted.includes('openingBalance'), false);
  assert.ok(importedKey.every((value) => value === 0));
});

test('wrong passwords and altered metadata or ciphertext fail authentication', async () => {
  const envelope = JSON.parse(await encryptBackup(json, password));
  assert.throws(() => decrypt(envelope, 'Another wrong password'));
  assert.throws(() => decrypt({ ...envelope, version: 2 }, password));
  const combined = Buffer.from(envelope.sealedData, 'base64');
  combined[12] ^= 1;
  assert.throws(() => decrypt({ ...envelope, sealedData: combined.toString('base64') }, password));
});

test('separate exports use fresh salt and ciphertext', async () => {
  const first = JSON.parse(await encryptBackup(json, password));
  const second = JSON.parse(await encryptBackup(json, password));
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.sealedData, second.sealedData);
});

test('password and payload validation happen before encryption', async () => {
  for (const value of ['', 'short', ' '.repeat(12), 'a'.repeat(129)]) {
    assert.throws(() => validateBackupPassword(value));
  }
  validateBackupPassword('a'.repeat(12));
  validateBackupPassword('a'.repeat(128));
  const before = cryptoCalls;
  await assert.rejects(() => encryptBackup(json, 'short'));
  await assert.rejects(() => encryptBackup('null', password));
  assert.equal(cryptoCalls, before);
});

test('sharing writes only an encrypted file and removes it after the sheet closes', async () => {
  await shareEncryptedBackup(json, password);
  const file = files.at(-1);
  assert.match(file.uri, /kuwenta-.*\.kuwenta$/);
  assert.equal(decrypt(JSON.parse(file.content), password), json);
  assert.equal(file.deleted, true);
  assert.equal(file.exists, false);
});

test('sharing and file-write failures still remove temporary files', async () => {
  sharingFails = true;
  try {
    await assert.rejects(() => shareEncryptedBackup(json, password), /Share failed/);
    assert.equal(files.at(-1).deleted, true);
  } finally { sharingFails = false; }
  writingFails = true;
  try {
    await assert.rejects(() => shareEncryptedBackup(json, password), /Write failed/);
    assert.equal(files.at(-1).deleted, true);
  } finally { writingFails = false; }
});

test('unavailable sharing creates no file and does no encryption work', async () => {
  available = false;
  const beforeFiles = files.length;
  const beforeCrypto = cryptoCalls;
  try {
    await assert.rejects(() => shareEncryptedBackup(json, password), /unavailable/);
    assert.equal(files.length, beforeFiles);
    assert.equal(cryptoCalls, beforeCrypto);
  } finally { available = true; }
});

test('encryption failure clears derived key bytes and never creates a file', async () => {
  encryptionFails = true;
  const beforeFiles = files.length;
  try {
    await assert.rejects(() => shareEncryptedBackup(json, password), /Encryption failed/);
    assert.equal(files.length, beforeFiles);
    assert.ok(importedKey.every((value) => value === 0));
  } finally { encryptionFails = false; }
});
