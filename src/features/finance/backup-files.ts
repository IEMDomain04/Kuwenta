import { parseBackup, type FinanceBackup } from './backup';

export const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024;

/** New files are portable JSON. Only old protected files need an unlock step. */
export async function readBackupFile(json: string): Promise<FinanceBackup | null> {
  if (json.length > MAX_BACKUP_FILE_BYTES || new TextEncoder().encode(json).length > MAX_BACKUP_FILE_BYTES) {
    throw new Error('Backup files must be 10 MB or smaller.');
  }
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('Backup file is not valid JSON.'); }
  if (value && typeof value === 'object' && 'format' in value && value.format === 'kuwenta-encrypted') {
    const { parseEncryptedBackup } = await import('./encrypted-backup');
    parseEncryptedBackup(json);
    return null;
  }
  return parseBackup(json);
}

/** The share sheet cannot confirm whether the recipient actually saved the file. */
export async function shareBackup(json: string, onProgress?: (message: string) => void, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('Backup cancelled.');
  if (!await readBackupFile(json)) throw new Error('Export requires an unprotected financial backup.');
  const Sharing = await import('expo-sharing');
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  if (signal?.aborted) throw new Error('Backup cancelled.');
  const { File, Paths } = await import('expo-file-system');
  const { randomUUID } = await import('expo-crypto');
  if (signal?.aborted) throw new Error('Backup cancelled.');
  const file = new File(Paths.cache, 'kuwenta-backup-' + new Date().toISOString().slice(0, 10) + '-' + randomUUID() + '.json');
  try {
    file.create();
    file.write(json);
    onProgress?.('Choose where to save your backup.');
    if (signal?.aborted) throw new Error('Backup cancelled.');
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save Kuwenta backup' });
  } finally {
    if (file.exists) file.delete();
  }
}

/** Read a bounded amount and validate before preview; never delete the selected file. */
export async function pickBackupFile(): Promise<{ name: string; json: string; backup: FinanceBackup | null } | null> {
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
    return { name: file.name, json, backup: await readBackupFile(json) };
  } finally { handle.close(); }
}
