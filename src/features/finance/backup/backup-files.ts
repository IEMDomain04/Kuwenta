import { parseBackup, type FinanceBackup } from './backup';

export type BackupFileFormat = 'json' | 'xlsx';

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
export async function shareBackup(json: string, onProgress?: (message: string) => void, signal?: AbortSignal, format: BackupFileFormat = 'json'): Promise<void> {
  if (signal?.aborted) throw new Error('Backup cancelled.');
  const backup = await readBackupFile(json);
  if (!backup) throw new Error('Export requires an unprotected financial backup.');
  const content = format === 'xlsx' ? (await import('./excel-backup')).createExcelBackup(backup) : json;
  const Sharing = await import('expo-sharing');
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  if (signal?.aborted) throw new Error('Backup cancelled.');
  const { File, Paths } = await import('expo-file-system');
  const { randomUUID } = await import('expo-crypto');
  if (signal?.aborted) throw new Error('Backup cancelled.');
  const file = new File(Paths.cache, 'kuwenta-backup-' + new Date().toISOString().slice(0, 10) + '-' + randomUUID() + '.' + format);
  try {
    file.create();
    file.write(content);
    onProgress?.('Choose where to save your backup.');
    if (signal?.aborted) throw new Error('Backup cancelled.');
    await Sharing.shareAsync(file.uri, {
      mimeType: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json',
      UTI: format === 'xlsx' ? 'org.openxmlformats.spreadsheetml.sheet' : 'public.json', dialogTitle: 'Save Kuwenta backup',
    });
  } finally {
    if (file.exists) file.delete();
  }
}

/** Read a bounded amount and validate before preview; never delete the selected file. */
export async function pickBackupFile(): Promise<{ name: string; json: string; backup: FinanceBackup | null } | null> {
  const { File, FileMode, Paths } = await import('expo-file-system');
  const selected = await File.pickFileAsync({ mimeTypes: '*/*', multipleFiles: false });
  if (selected.canceled) return null;
  const source = selected.result;
  // Android document providers may omit size metadata even for readable files.
  let reportedSize: number | null = null;
  try { reportedSize = source.size; } catch { /* Verify the local copy instead. */ }
  if (reportedSize !== null && reportedSize > MAX_BACKUP_FILE_BYTES) {
    throw new Error('Backup files must be 10 MB or smaller.');
  }
  const { randomUUID } = await import('expo-crypto');
  const file = new File(Paths.cache, 'kuwenta-import-' + randomUUID() + '.tmp');
  try {
    // Provider URIs may not support random-access reads; use a private local copy.
    try { await source.copy(file); }
    catch { throw new Error('Could not read this file. Save a copy in Downloads, then choose it again.'); }
    if (file.size !== null && file.size > MAX_BACKUP_FILE_BYTES) {
      throw new Error('Backup files must be 10 MB or smaller.');
    }
    const handle = file.open(FileMode.ReadOnly);
    let bytes: Uint8Array;
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
      if (size === 0) throw new Error('This backup file is empty. Export a new backup and save it before importing.');
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    } finally { handle.close(); }
    const name = source.name || 'Kuwenta backup';
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const { parseExcelBackup } = await import('./excel-backup');
      const backup = parseExcelBackup(bytes);
      return { name, json: JSON.stringify(backup), backup };
    }
    let json: string;
    try { json = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('Choose a Kuwenta JSON or Excel (.xlsx) backup.'); }
    return { name, json, backup: await readBackupFile(json) };
  } finally {
    if (file.exists) file.delete();
  }
}
