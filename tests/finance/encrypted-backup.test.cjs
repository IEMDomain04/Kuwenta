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
let nativeBackupCrypto = null;
let picked = null;
let exportedEnvelope;
let decryptedBytes;
const expoCrypto = {
  AESSealedData: { fromCombined: (base64) => Buffer.from(base64, 'base64') },
  aesDecryptAsync: async (combined, key, options) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, combined.subarray(0, 12));
    decipher.setAAD(Buffer.from(options.additionalData));
    decipher.setAuthTag(combined.subarray(-16));
    decryptedBytes = new Uint8Array(Buffer.concat([
      decipher.update(combined.subarray(12, -16)), decipher.final(),
    ]));
    return decryptedBytes;
  },
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
  static async pickFileAsync() { return picked ? { canceled: false, result: picked } : { canceled: true, result: null }; }
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
  if (name === 'expo') return { requireOptionalNativeModule: name => { assert.equal(name, 'KuwentaBackupCrypto'); return nativeBackupCrypto; } };
  if (name === 'expo-crypto') return expoCrypto;
  if (name === 'expo-file-system') return { File, FileMode: { ReadOnly: 'r' }, Paths: { cache: 'cache' } };
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
const { encryptBackup, shareEncryptedBackup, validateBackupPassword, BACKUP_KEY_ITERATIONS,
  decryptBackup, parseEncryptedBackup, pickBackupFile, MAX_BACKUP_FILE_BYTES } =
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
  exportedEnvelope = envelope;
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
  for (const value of ['', 'short', 'a'.repeat(7), ' '.repeat(12), 'a'.repeat(129)]) {
    assert.throws(() => validateBackupPassword(value));
  }
  validateBackupPassword('a'.repeat(8));
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

function sealedPayload(plaintext) {
  const { header } = parseEncryptedBackup(JSON.stringify(exportedEnvelope));
  const key = crypto.pbkdf2Sync(password, Buffer.from(header.salt, 'hex'), header.iterations, 32, 'sha256');
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return JSON.stringify({ ...header, sealedData: Buffer.concat([nonce, encrypted, cipher.getAuthTag()]).toString('base64') });
}

function selectedFile(text, reportedSize = Buffer.byteLength(text)) {
  const bytes = Buffer.from(text);
  const file = {
    name: 'example.kuwenta', size: reportedSize, closed: false, opened: false, deleted: false,
    open: () => {
      file.opened = true;
      let offset = 0;
      return {
        readBytes: (count) => {
          const result = new Uint8Array(bytes.subarray(offset, offset + count));
          offset += result.length;
          return result;
        },
        close: () => { file.closed = true; },
      };
    },
  };
  return file;
}

test('import decrypts an exported file, preserves records and wipes temporary key/plaintext bytes', async () => {
  const result = await decryptBackup(JSON.stringify(exportedEnvelope), password);
  assert.deepEqual(result, parseBackup(json));
  assert.ok(importedKey.every((byte) => byte === 0));
  assert.ok(decryptedBytes.every((byte) => byte === 0));
});

test('reordered envelope keys still authenticate using canonical export metadata', async () => {
  const reversed = Object.fromEntries(Object.entries(exportedEnvelope).reverse());
  assert.deepEqual(await decryptBackup(JSON.stringify(reversed), password), parseBackup(json));
});

test('import rejects wrong passwords and modified ciphertext without exposing financial data', async () => {
  await assert.rejects(() => decryptBackup(JSON.stringify(exportedEnvelope), 'Wrong long passphrase'), /incorrect or the file has been altered/);
  const bytes = Buffer.from(exportedEnvelope.sealedData, 'base64');
  bytes[12] ^= 1;
  await assert.rejects(() => decryptBackup(JSON.stringify({
    ...exportedEnvelope, sealedData: bytes.toString('base64'),
  }), password), /incorrect or the file has been altered/);
});

test('invalid envelope settings and oversized content fail before password derivation', async () => {
  const before = importedKey;
  for (const patch of [
    { version: 2 }, { format: 'other' }, { cipher: 'AES-CBC' }, { kdf: 'other' },
    { iterations: 1 }, { iterations: 1e12 }, { salt: '00' },
    { sealedData: 'abc' }, { sealedData: '?'.repeat(40) }, { unexpected: true },
  ]) {
    const invalid = JSON.stringify({ ...exportedEnvelope, ...patch });
    assert.throws(() => parseEncryptedBackup(invalid));
    await assert.rejects(() => decryptBackup(invalid, password));
  }
  for (const invalid of ['null', '[]', '{', '{}']) assert.throws(() => parseEncryptedBackup(invalid));
  assert.throws(() => parseEncryptedBackup(' '.repeat(MAX_BACKUP_FILE_BYTES + 1)), /10 MB/);
  assert.equal(importedKey, before);
});

test('authenticated but invalid financial records cannot produce a preview', async () => {
  const invalid = JSON.parse(json);
  invalid.transactions[0].amount = -1;
  await assert.rejects(() => decryptBackup(sealedPayload(JSON.stringify(invalid)), password), /positive safe integer/);
});

test('empty backups and negative balances decrypt and produce accurate previews', async () => {
  const { previewBackup } = require('../../.expo/finance-tests/backup.js');
  const empty = serializeBackup({ ...cash, openingBalance: -100 }, [], '2026-10-09T06:35:00.000Z');
  const result = await decryptBackup(sealedPayload(empty), password);
  assert.equal(previewBackup(result).transactionCount, 0);
  assert.equal(previewBackup(result).cashBalance, -100);
});

test('picker cancellation returns no selection; valid file closes its handle without deletion', async () => {
  picked = null;
  assert.equal(await pickBackupFile(), null);
  picked = selectedFile(JSON.stringify(exportedEnvelope));
  try {
    const result = await pickBackupFile();
    assert.equal(result.name, 'example.kuwenta');
    assert.equal(result.json, JSON.stringify(exportedEnvelope));
    assert.equal(picked.closed, true);
    assert.equal(picked.deleted, false);
  } finally { picked = null; }
});

test('picker checks size before reading and validates contents while always closing its handle', async () => {
  picked = selectedFile('{}', MAX_BACKUP_FILE_BYTES + 1);
  try {
    await assert.rejects(() => pickBackupFile(), /10 MB/);
    assert.equal(picked.opened, false);
    picked = selectedFile('{}');
    await assert.rejects(() => pickBackupFile(), /Unsupported/);
    assert.equal(picked.closed, true);
    picked = selectedFile(' '.repeat(MAX_BACKUP_FILE_BYTES + 1), 1);
    await assert.rejects(() => pickBackupFile(), /10 MB/);
    assert.equal(picked.closed, true);
  } finally { picked = null; }
});

test('encrypted backups preserve goals and historical transfer purposes', async () => {
  const saving = { ...cash, id: 'save', name: 'Savings', openingBalance: 0, purpose: 'savings', includedInAvailable: false };
  const transfer = record({ type: 'TRANSFER', category: 'Transfer', amount: 20000, destinationAccountId: 'save', sourcePurpose: 'spending', destinationPurpose: 'savings' });
  const goal = { id: 'goal', name: 'Emergency fund', accountId: 'save', targetAmount: 50000, createdAt: '2026-10-09T06:35:00.000Z', updatedAt: '2026-10-09T06:35:00.000Z' };
  const budgets = [{ month: '2026-10', category: 'Food', limitAmount: 500000 }];
  const payload = serializeBackup([cash, saving], [transfer], '2026-10-09T06:35:00.000Z', [goal], budgets);
  const encrypted = await encryptBackup(payload, password);
  assert.equal(encrypted.includes('Emergency fund'), false);
  const restored = await decryptBackup(encrypted, password);
  assert.deepEqual(restored.goals, [goal]);
  assert.deepEqual(restored.budgets, budgets);
  assert.equal(restored.transactions[0].sourcePurpose, 'spending');
  assert.equal(restored.transactions[0].destinationPurpose, 'savings');
});

test('eight-character export passwords round-trip through the existing encrypted format', async () => {
  const encrypted = await encryptBackup(json, '1234abcd');
  assert.deepEqual(await decryptBackup(encrypted, '1234abcd'), parseBackup(json));
});

test('export reports each preparation stage before sharing', async () => {
  const stages = [];
  await shareEncryptedBackup(json, password, stage => stages.push(stage));
  assert.deepEqual(stages, ['Checking file sharing...', 'Protecting your backup...', 'Writing backup file...', 'Choose where to save your backup.']);
});

test('cancelling preparation prevents file creation and later sharing', async () => {
  const controller = new AbortController();
  const before = files.length;
  await assert.rejects(() => shareEncryptedBackup(json, password, stage => {
    if (stage === 'Protecting your backup...') controller.abort(new Error('Backup cancelled.'));
  }, controller.signal), /Backup cancelled/);
  assert.equal(files.length, before);
});

test('cancellation during encryption wipes the key and never creates a file', async () => {
  const controller = new AbortController();
  const before = files.length;
  const encrypt = expoCrypto.aesEncryptAsync;
  expoCrypto.aesEncryptAsync = async (...args) => {
    const result = await encrypt(...args);
    controller.abort(new Error('Backup cancelled.'));
    return result;
  };
  try {
    await assert.rejects(() => shareEncryptedBackup(json, password, undefined, controller.signal), /Backup cancelled/);
    assert.equal(files.length, before);
    assert.ok(importedKey.every(byte => byte === 0));
  } finally { expoCrypto.aesEncryptAsync = encrypt; }
});

test('cancellation also works with the React Native AbortController polyfill', async () => {
  const { AbortController: NativeAbortController } = require('abort-controller/dist/abort-controller');
  const controller = new NativeAbortController();
  controller.abort();
  const before = files.length;
  await assert.rejects(() => shareEncryptedBackup(json, password, undefined, controller.signal), /Backup cancelled/);
  assert.equal(files.length, before);
});

test('native derivation exports and imports the unchanged format, including Unicode passwords', async () => {
  let calls = 0;
  nativeBackupCrypto = { deriveKey: async (value, salt, iterations) => {
    calls++;
    assert.equal(iterations, 600000);
    return crypto.pbkdf2Sync(Buffer.from(value, 'utf8'), Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex');
  } };
  try {
    const encrypted = await encryptBackup(json, password);
    assert.equal(decrypt(JSON.parse(encrypted), password), json);
    assert.deepEqual(await decryptBackup(encrypted, password), parseBackup(json));
    assert.deepEqual(await decryptBackup(JSON.stringify(exportedEnvelope), password), parseBackup(json));
    assert.equal(calls, 3);
  } finally { nativeBackupCrypto = null; }
});

test('native errors and malformed keys fail before creating a backup file', async () => {
  const before = files.length;
  nativeBackupCrypto = { deriveKey: async () => { throw new Error('Native key derivation failed'); } };
  try {
    await assert.rejects(() => shareEncryptedBackup(json, password), /Native key derivation failed/);
    nativeBackupCrypto = { deriveKey: async () => '00' };
    await assert.rejects(() => shareEncryptedBackup(json, password), /Could not protect the backup/);
    assert.equal(files.length, before);
  } finally { nativeBackupCrypto = null; }
});
