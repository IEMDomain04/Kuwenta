import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { parseBackup } from './backup';

export const BACKUP_KEY_ITERATIONS = 600_000;

export function validateBackupPassword(password: string): void {
  if (password.trim().length < 12 || password.length > 128) {
    throw new Error('Use a password or passphrase of 12 to 128 characters.');
  }
}

/** Export-only envelope. Its header is authenticated along with the ciphertext. */
export async function encryptBackup(json: string, password: string): Promise<string> {
  validateBackupPassword(password);
  parseBackup(json);
  const { getRandomBytesAsync, AESEncryptionKey, aesEncryptAsync } = await import('expo-crypto');
  const salt = await getRandomBytesAsync(16);
  const header = {
    format: 'kuwenta-encrypted', version: 1, cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-HMAC-SHA256', iterations: BACKUP_KEY_ITERATIONS, salt: bytesToHex(salt),
  };
  const passwordBytes = utf8ToBytes(password);
  const plaintext = utf8ToBytes(json);
  let keyBytes: Uint8Array | undefined;
  try {
    // Async derivation yields to the UI while performing the password work factor.
    keyBytes = await pbkdf2Async(sha256, passwordBytes, salt, {
      c: BACKUP_KEY_ITERATIONS, dkLen: 32, asyncTick: 20,
    });
    const key = await AESEncryptionKey.import(keyBytes);
    const sealed = await aesEncryptAsync(plaintext, key, {
      nonce: { length: 12 }, tagLength: 16,
      additionalData: utf8ToBytes(JSON.stringify(header)),
    });
    const sealedData = await sealed.combined('base64');
    return JSON.stringify({ ...header, sealedData }, null, 2);
  } finally {
    passwordBytes.fill(0);
    plaintext.fill(0);
    keyBytes?.fill(0);
  }
}

/** The share sheet cannot confirm whether the recipient actually saved the file. */
export async function shareEncryptedBackup(json: string, password: string): Promise<void> {
  const Sharing = await import('expo-sharing');
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  const encrypted = await encryptBackup(json, password);
  const { File, Paths } = await import('expo-file-system');
  const { randomUUID } = await import('expo-crypto');
  const file = new File(Paths.cache, 'kuwenta-' + randomUUID() + '.kuwenta');
  try {
    file.create();
    file.write(encrypted);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/octet-stream', UTI: 'public.data', dialogTitle: 'Save encrypted Kuwenta backup',
    });
  } finally {
    if (file.exists) file.delete();
  }
}
