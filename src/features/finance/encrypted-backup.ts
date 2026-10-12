import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { parseBackup, type FinanceBackup } from './backup';

export const BACKUP_KEY_ITERATIONS = 600_000;
export const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024;

export function validateBackupPassword(password: string): void {
  if (password.trim().length < 8 || password.length > 128) {
    throw new Error('Use a password or passphrase of 8 to 128 characters.');
  }
}

/** The native and JS implementations produce the same version-1 backup key. */
async function deriveBackupKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const { requireOptionalNativeModule } = await import('expo');
  const native = requireOptionalNativeModule<{ deriveKey: (password: string, salt: string, iterations: number) => Promise<string> }>('KuwentaBackupCrypto');
  if (native) {
    const hex = await native.deriveKey(password, bytesToHex(salt), BACKUP_KEY_ITERATIONS);
    if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('Could not protect the backup. Please try again.');
    return hexToBytes(hex);
  }
  // Expo Go, iOS, and older builds retain the compatible JS implementation.
  const passwordBytes = utf8ToBytes(password);
  try {
    return await pbkdf2Async(sha256, passwordBytes, salt, { c: BACKUP_KEY_ITERATIONS, dkLen: 32, asyncTick: 10 });
  } finally { passwordBytes.fill(0); }
}

/** Version-1 envelope. Its header is authenticated along with the ciphertext. */
export async function encryptBackup(json: string, password: string, signal?: AbortSignal): Promise<string> {
  checkCancelled(signal);
  validateBackupPassword(password);
  parseBackup(json);
  const { getRandomBytesAsync, AESEncryptionKey, aesEncryptAsync } = await import('expo-crypto');
  const salt = await getRandomBytesAsync(16);
  checkCancelled(signal);
  const header = {
    format: 'kuwenta-encrypted', version: 1, cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-HMAC-SHA256', iterations: BACKUP_KEY_ITERATIONS, salt: bytesToHex(salt),
  };
  const plaintext = utf8ToBytes(json);
  let keyBytes: Uint8Array | undefined;
  try {
    keyBytes = await deriveBackupKey(password, salt);
    checkCancelled(signal);
    const key = await AESEncryptionKey.import(keyBytes);
    checkCancelled(signal);
    const sealed = await aesEncryptAsync(plaintext, key, {
      nonce: { length: 12 }, tagLength: 16,
      additionalData: utf8ToBytes(JSON.stringify(header)),
    });
    checkCancelled(signal);
    const sealedData = await sealed.combined('base64');
    checkCancelled(signal);
    return JSON.stringify({ ...header, sealedData }, null, 2);
  } finally {
    plaintext.fill(0);
    keyBytes?.fill(0);
  }
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new Error('Backup cancelled.');
}

/** The share sheet cannot confirm whether the recipient actually saved the file. */
export async function shareEncryptedBackup(json: string, password: string, onProgress?: (message: string) => void, signal?: AbortSignal): Promise<void> {
  checkCancelled(signal);
  onProgress?.('Checking file sharing...');
  const Sharing = await import('expo-sharing');
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  checkCancelled(signal);
  onProgress?.('Protecting your backup...');
  // Give the progress message a frame before starting password derivation.
  await new Promise(resolve => setTimeout(resolve, 0));
  const encrypted = await encryptBackup(json, password, signal);
  parseEncryptedBackup(encrypted);
  const { File, Paths } = await import('expo-file-system');
  const { randomUUID } = await import('expo-crypto');
  checkCancelled(signal);
  onProgress?.('Writing backup file...');
  const file = new File(Paths.cache, 'kuwenta-' + randomUUID() + '.kuwenta');
  try {
    file.create();
    file.write(encrypted);
    checkCancelled(signal);
    onProgress?.('Choose where to save your backup.');
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/octet-stream', UTI: 'public.data', dialogTitle: 'Save encrypted Kuwenta backup',
    });
  } finally {
    if (file.exists) file.delete();
  }
}

export function parseEncryptedBackup(json: string): {
  header: { format: 'kuwenta-encrypted'; version: 1; cipher: 'AES-256-GCM';
    kdf: 'PBKDF2-HMAC-SHA256'; iterations: number; salt: string };
  sealedData: string;
} {
  if (json.length > MAX_BACKUP_FILE_BYTES || utf8ToBytes(json).length > MAX_BACKUP_FILE_BYTES) {
    throw new Error('Backup files must be 10 MB or smaller.');
  }
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new Error('Backup file is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid encrypted backup.');
  const row = value as Record<string, unknown>;
  const keys = ['format', 'version', 'cipher', 'kdf', 'iterations', 'salt', 'sealedData'];
  if (Object.keys(row).some((key) => !keys.includes(key))
    || row.format !== 'kuwenta-encrypted' || row.version !== 1
    || row.cipher !== 'AES-256-GCM' || row.kdf !== 'PBKDF2-HMAC-SHA256'
    || row.iterations !== BACKUP_KEY_ITERATIONS) {
    throw new Error('Unsupported encrypted backup format or encryption settings.');
  }
  if (typeof row.salt !== 'string' || !/^[a-f0-9]{32}$/.test(row.salt)
    || typeof row.sealedData !== 'string' || row.sealedData.length < 40
    || row.sealedData.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.sealedData)) {
    throw new Error('Backup encryption data is invalid or truncated.');
  }
  // Rebuild in the exporter's order: JSON object key order must not change AAD.
  return {
    header: { format: 'kuwenta-encrypted', version: 1, cipher: 'AES-256-GCM',
      kdf: 'PBKDF2-HMAC-SHA256', iterations: BACKUP_KEY_ITERATIONS, salt: row.salt },
    sealedData: row.sealedData,
  };
}

export async function decryptBackup(json: string, password: string): Promise<FinanceBackup> {
  const { header, sealedData } = parseEncryptedBackup(json);
  validateBackupPassword(password);
  const { AESEncryptionKey, AESSealedData, aesDecryptAsync } = await import('expo-crypto');
  let keyBytes: Uint8Array | undefined;
  let plaintext: Uint8Array | undefined;
  try {
    keyBytes = await deriveBackupKey(password, hexToBytes(header.salt));
    const key = await AESEncryptionKey.import(keyBytes);
    try {
      plaintext = await aesDecryptAsync(AESSealedData.fromCombined(sealedData, { ivLength: 12, tagLength: 16 }), key, {
        additionalData: utf8ToBytes(JSON.stringify(header)),
      });
    } catch {
      throw new Error('Could not unlock backup. The password is incorrect or the file has been altered.');
    }
    return parseBackup(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } finally {
    keyBytes?.fill(0);
    plaintext?.fill(0);
  }
}

/** Read a bounded amount; never delete the user's selected file. */
export async function pickBackupFile(): Promise<{ name: string; json: string } | null> {
  const { File, FileMode } = await import('expo-file-system');
  const selected = await File.pickFileAsync({ mimeTypes: '*/*', multipleFiles: false });
  if (selected.canceled) return null;
  const file = selected.result;
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_BACKUP_FILE_BYTES) {
    throw new Error('Select a readable backup file of 10 MB or smaller.');
  }
  const handle = file.open(FileMode.ReadOnly);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const bytes = handle.readBytes(Math.min(64 * 1024, MAX_BACKUP_FILE_BYTES + 1 - size));
      if (bytes.length === 0) break;
      size += bytes.length;
      if (size > MAX_BACKUP_FILE_BYTES) throw new Error('Backup files must be 10 MB or smaller.');
      chunks.push(bytes);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    parseEncryptedBackup(json);
    return { name: file.name, json };
  } finally { handle.close(); }
}
