const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { cash, record } = require('./fixtures.cjs');
const { serializeBackup, parseBackup } = require('../../.expo/finance-tests/backup.js');
const originalLoad = Module._load;
const files = [];
let selected = null, available = true, failShare = false, failWrite = false, shares = 0, identifiers = 0;
class File {
  static async pickFileAsync() { return selected ? { canceled: false, result: selected } : { canceled: true }; }
  constructor(directory, name) { this.uri = directory + '/' + name; this.exists = false; files.push(this); }
  create() { this.exists = true; }
  write(content) { if (failWrite) throw new Error('Write failed'); this.content = content; }
  delete() { this.exists = false; }
  open() { const local = picked(this.content); const handle = local.open(); return { readBytes: count => handle.readBytes(count), close: () => { handle.close(); this.closed = true; } }; }
}
Module._load = function(name, ...args) {
  if (name === 'expo-file-system') return { File, Paths: { cache: 'cache' }, FileMode: { ReadOnly: 'r' } };
  if (name === 'expo-sharing') return {
    isAvailableAsync: async () => available,
    shareAsync: async (uri, options) => {
      shares++;
      const file = files.find(file => file.uri === uri);
      assert.equal(file.exists, true);
      if (uri.endsWith('.xlsx')) {
        assert.equal(options.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        assert.deepEqual(require('../../.expo/finance-tests/excel-backup.js').parseExcelBackup(file.content), parseBackup(json));
      } else {
        assert.equal(options.mimeType, 'application/json');
        assert.deepEqual(parseBackup(file.content), parseBackup(json));
      }
      if (failShare) throw new Error('Sharing failed');
    },
  };
  if (name === 'expo-crypto') return { randomUUID: () => 'unique-' + ++identifiers, aesEncryptAsync: () => { throw new Error('New exports must not encrypt'); } };
  return originalLoad.call(this, name, ...args);
};
after(() => { Module._load = originalLoad; });
const { shareBackup, readBackupFile, pickBackupFile, MAX_BACKUP_FILE_BYTES } = require('../../.expo/finance-tests/backup-files.js');
const json = serializeBackup(cash, [record({ notes: 'Meals' })], '2026-10-09T06:35:00.000Z');
function picked(text, reportedSize = Buffer.byteLength(text)) {
  const bytes = Buffer.from(text); let offset = 0;
  return { name: 'kuwenta.json', size: reportedSize, closed: false, copied: false, async copy(destination) { await Promise.resolve(); destination.content = text; destination.size = Buffer.byteLength(text); destination.exists = true; this.copied = true; }, open() {
    return { readBytes: count => { const part = new Uint8Array(bytes.subarray(offset, offset + count)); offset += part.length; return part; }, close: () => { this.closed = true; } };
  } };
}
test('new backups export without key derivation and clean temporary files after sharing', async () => {
  const stages = [];
  await shareBackup(json, stage => stages.push(stage));
  assert.deepEqual(stages, ['Choose where to save your backup.']);
  assert.equal(files.at(-1).exists, false);
  assert.ok(files.at(-1).uri.endsWith('.json'));
  assert.equal(shares, 1);
});
test('failed writing or sharing cleans up the temporary plain-text file', async () => {
  failWrite = true;
  try { await assert.rejects(() => shareBackup(json), /Write failed/); assert.equal(files.at(-1).exists, false); } finally { failWrite = false; }
  failShare = true;
  try { await assert.rejects(() => shareBackup(json), /Sharing failed/); assert.equal(files.at(-1).exists, false); } finally { failShare = false; }
});
test('unavailable sharing and invalid backups do not create files', async () => {
  const before = files.length;
  available = false;
  try { await assert.rejects(() => shareBackup(json), /unavailable/); } finally { available = true; }
  await assert.rejects(() => shareBackup('{}'));
  assert.equal(files.length, before);
});
test('plain backup selection validates records immediately and closes its handle', async () => {
  selected = picked(json);
  try {
    const file = await pickBackupFile();
    assert.deepEqual(file.backup, parseBackup(json));
    assert.equal(selected.copied, true);
    assert.equal(files.at(-1).closed, true);
    assert.equal(files.at(-1).exists, false);
  } finally { selected = null; }
});
test('invalid, oversized, truncated and invalid UTF-8 files cannot produce a preview', async () => {
  const invalid = JSON.parse(json); invalid.transactions[0].amount = -1;
  for (const content of ['{', '{}', JSON.stringify(invalid)]) await assert.rejects(() => readBackupFile(content));
  await assert.rejects(() => readBackupFile(' '.repeat(MAX_BACKUP_FILE_BYTES + 1)), /10 MB/);
  selected = picked(json, MAX_BACKUP_FILE_BYTES + 1);
  try { await assert.rejects(() => pickBackupFile(), /10 MB/); } finally { selected = null; }
  selected = picked(Buffer.from([0xff]));
  try { await assert.rejects(() => pickBackupFile()); assert.equal(selected.copied, true);
    assert.equal(files.at(-1).closed, true);
    assert.equal(files.at(-1).exists, false); } finally { selected = null; }
  assert.equal(await pickBackupFile(), null);
});
test('protected legacy envelopes are detected without requesting a password for new files', async () => {
  const envelope = JSON.stringify({ format: 'kuwenta-encrypted', version: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-HMAC-SHA256', iterations: 600000, salt: '00'.repeat(16), sealedData: 'A'.repeat(40) });
  assert.equal(await readBackupFile(envelope), null);
  await assert.rejects(() => readBackupFile(JSON.stringify({ ...JSON.parse(envelope), iterations: 1 })), /Unsupported/);
});

test('leaving the export screen prevents sharing and removes any prepared temporary file', async () => {
  const controller = new AbortController(), beforeFiles = files.length, beforeShares = shares;
  controller.abort();
  await assert.rejects(() => shareBackup(json, undefined, controller.signal), /cancelled/);
  assert.equal(files.length, beforeFiles);
  const during = new AbortController();
  await assert.rejects(() => shareBackup(json, () => during.abort(), during.signal), /cancelled/);
  assert.equal(files.at(-1).exists, false);
  assert.equal(shares, beforeShares);
});


test('Android provider files with missing or zero size metadata are read from a local copy', async () => {
 for (const reported of [null, 0, undefined, -1]) {
  selected = picked(json); selected.size = reported;
  selected.open = () => { throw new Error('Provider does not support random-access reads'); };
  try {
   const result = await pickBackupFile();
   assert.equal(result.name, 'kuwenta.json');
   assert.deepEqual(result.backup, parseBackup(json));
   assert.equal(files.at(-1).closed, true);
   assert.equal(files.at(-1).exists, false);
  } finally { selected = null; }
 }
 selected = picked(json);
 Object.defineProperty(selected, 'size', { get() { throw new Error('Missing metadata'); } });
 try { assert.deepEqual((await pickBackupFile()).backup, parseBackup(json)); }
 finally { selected = null; }
});

test('actual oversize, empty files and denied provider access produce distinct errors and clean up', async () => {
 selected = picked(' '.repeat(MAX_BACKUP_FILE_BYTES + 1), null);
 try { await assert.rejects(() => pickBackupFile(), /10 MB/); assert.equal(files.at(-1).exists, false); }
 finally { selected = null; }
 selected = picked('', 0);
 try { await assert.rejects(() => pickBackupFile(), /empty/); assert.equal(files.at(-1).closed, true); assert.equal(files.at(-1).exists, false); }
 finally { selected = null; }
 selected = picked(json, null);
 selected.copy = async destination => { destination.exists = true; throw new Error('Permission denied'); };
 try { await assert.rejects(() => pickBackupFile(), /Save a copy in Downloads/); assert.equal(files.at(-1).exists, false); }
 finally { selected = null; }
 selected = picked('{', null);
 try { await assert.rejects(() => pickBackupFile(), /not valid JSON/); assert.equal(files.at(-1).closed, true); assert.equal(files.at(-1).exists, false); }
 finally { selected = null; }
});

test('bounded reader rejects providers that underreport the actual copied file size', async () => {
 selected = picked(' '.repeat(MAX_BACKUP_FILE_BYTES + 1), 1);
 const copy = selected.copy;
 selected.copy = async destination => { await copy(destination); destination.size = 1; };
 try { await assert.rejects(() => pickBackupFile(), /10 MB/); assert.equal(files.at(-1).closed, true); assert.equal(files.at(-1).exists, false); }
 finally { selected = null; }
});


test('Excel export produces a workbook and the Android picker restores its complete backup', async () => {
 await shareBackup(json, undefined, undefined, 'xlsx');
 const exported = files.at(-1);
 assert.ok(exported.uri.endsWith('.xlsx'));
 assert.equal(exported.exists, false);
 selected = picked(exported.content, null); selected.name = 'kuwenta.xlsx';
 try {
  const imported = await pickBackupFile();
  assert.deepEqual(imported.backup, parseBackup(json));
  assert.deepEqual(parseBackup(imported.json), imported.backup);
  assert.equal(imported.name, 'kuwenta.xlsx');
  assert.equal(files.at(-1).closed, true);
  assert.equal(files.at(-1).exists, false);
 } finally { selected = null; }
});
