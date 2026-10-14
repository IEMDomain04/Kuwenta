import Constants, { ExecutionEnvironment } from 'expo-constants';
import { openDatabaseAsync, defaultDatabaseDirectory, deleteDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { File, Directory } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';
import { initializeDatabase, DatabaseRecoveryError } from './database';
import { parseBackup, type FinanceBackup } from '../backup';
import { restoreBackup } from './backup';

const DATABASE = 'kuwenta-encrypted.db';
const TEMPORARY = 'kuwenta-encrypting.db';
const LEGACY = 'kuwenta.db';
const KEY = 'kuwenta.database-key.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const RECOVERED_NAME = /^kuwenta-recovered-[a-f0-9]{32}\.db$/;
// Android SQLite exposes a filesystem path; File/Directory require a file URI.
// Encode raw path segments once, while leaving existing iOS file URIs intact.
const directoryUri = defaultDatabaseDirectory.startsWith('file://')
  ? defaultDatabaseDirectory
  : 'file://' + defaultDatabaseDirectory.split('/').map(encodeURIComponent).join('/');
const file = (name: string) => new File(directoryUri, name);

function requireEncryptedBuild() {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    throw new Error('Encrypted records need the Kuwenta app. Open an installed Kuwenta APK or development build instead of Expo Go.');
  }
}
function hasDatabaseFiles(name: string) {
  return ['', '-wal', '-shm', '-journal'].some(suffix => file(name + suffix).exists);
}
async function randomKey() {
  return Array.from(await getRandomBytesAsync(32), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function removeDatabase(name: string) {
  if (file(name).exists) await deleteDatabaseAsync(name);
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = file(name + suffix);
    if (sidecar.exists) sidecar.delete();
  }
}

async function verify(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (result?.integrity_check !== 'ok' || (await db.getAllAsync('PRAGMA foreign_key_check')).length) {
    throw new Error('Database verification failed. Your existing records were preserved.');
  }
}

async function openKeyed(name: string, key: string) {
  const db = await openDatabaseAsync(name, { useNewConnection: true });
  try {
    // Only validated random hex is interpolated; no user input or password is SQL text.
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    if (!(await db.getFirstAsync('PRAGMA cipher_version'))) {
      throw new Error('Install the updated Kuwenta APK to enable encrypted storage. Expo Go cannot open it.');
    }
    await db.getFirstAsync('SELECT count(*) FROM sqlite_master');
    // Expo's default exclusive transaction creates an unkeyed connection.
    // Preserve that isolation with a keyed connection and enable FK checks on it too.
    db.withExclusiveTransactionAsync = async task => {
      const transaction = await openKeyed(name, key);
      let begun = false;
      try {
        await transaction.execAsync('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;');
        begun = true;
        await task(transaction);
        await transaction.execAsync('COMMIT');
      } catch (cause) {
        if (begun) await transaction.execAsync('ROLLBACK');
        throw cause;
      } finally { await transaction.closeAsync(); }
    };
    return db;
  } catch (cause) {
    await db.closeAsync();
    if (cause instanceof Error && cause.message.startsWith('Install the updated')) throw cause;
    throw new DatabaseRecoveryError('Could not unlock your records. Unlock your phone and retry. Your data has not been reset.');
  }
}

/** Native-only: web uses its existing unsupported-preview provider. */
export async function openEncryptedDatabase(): Promise<SQLiteDatabase> {
  requireEncryptedBuild();
  const saved = await SecureStore.getItemAsync(KEY, OPTIONS);
  let key = saved;
  let databaseName = DATABASE;
  // Original installs saved raw hex. Recovery uses one atomic key+filename record.
  if (saved?.startsWith('{')) {
    try {
      const entry = JSON.parse(saved);
      if (typeof entry.database !== 'string' || !RECOVERED_NAME.test(entry.database) || typeof entry.key !== 'string') throw new Error();
      databaseName = entry.database; key = entry.key;
    } catch { throw new DatabaseRecoveryError('The saved security key is invalid. Restore an exported backup to recover your records.'); }
  }
  const existing = file(databaseName).exists;
  const directory = new Directory(directoryUri);
  const recoveredExists = !saved && directory.exists && directory.list().some(entry => RECOVERED_NAME.test(entry.name));
  if (!key && (hasDatabaseFiles(databaseName) || recoveredExists)) {
    throw new DatabaseRecoveryError('The security key for these records is missing. Your database is preserved. Restore an exported backup to recover your records.');
  }
  if (!existing && (saved?.startsWith('{') || hasDatabaseFiles(databaseName))) {
    throw new DatabaseRecoveryError('The secured database is missing. Restore an exported backup to recover your records.');
  }
  if (!key) {
    key = await randomKey();
    await SecureStore.setItemAsync(KEY, key, OPTIONS);
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new DatabaseRecoveryError('The saved security key is invalid. Your records are preserved. Restore an exported backup to recover them.');
  if (!existing) {
    // An interrupted export never replaces the original database. Rebuild only the staging copy.
    await removeDatabase(TEMPORARY);
    const staging = await openKeyed(TEMPORARY, key);
    try {
      if (file(LEGACY).exists) {
        await staging.runAsync("ATTACH DATABASE ? AS legacy KEY ''", decodeURIComponent(file(LEGACY).uri.replace(/^file:\/\//, '')));
        try {
          const version = (await staging.getFirstAsync<{ user_version: number }>('PRAGMA legacy.user_version'))?.user_version;
          if (!Number.isSafeInteger(version) || version! < 1) throw new Error('Existing records could not be verified.');
          await staging.getFirstAsync("SELECT sqlcipher_export('main', 'legacy')");
          await staging.execAsync(`PRAGMA user_version = ${version};`);
          const tables = await staging.getAllAsync<{ name: string }>("SELECT name FROM legacy.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
          for (const { name } of tables) {
            const identifier = '"' + name.replace(/"/g, '""') + '"';
            const difference = await staging.getFirstAsync(`SELECT 1 FROM (SELECT * FROM legacy.${identifier} EXCEPT SELECT * FROM main.${identifier}) UNION ALL SELECT 1 FROM (SELECT * FROM main.${identifier} EXCEPT SELECT * FROM legacy.${identifier}) LIMIT 1`);
            if (difference) throw new Error('Copied records did not match.');
          }
        } finally { await staging.execAsync('DETACH DATABASE legacy'); }
      } else await initializeDatabase(staging);
      await verify(staging);
    } catch {
      throw new Error('Could not encrypt your records. The original database is preserved. Tap Retry.');
    } finally { await staging.closeAsync(); }
    // The verified, closed staging file is published before any plaintext is deleted.
    try { await file(TEMPORARY).move(file(DATABASE)); }
    catch { throw new Error('Could not finish securing your records. The original database is preserved. Tap Retry.'); }
  }
  const db = await openKeyed(databaseName, key);
  try {
    await initializeDatabase(db);
    // Legacy files only remain after migration or an interrupted cleanup.
    if (hasDatabaseFiles(LEGACY)) {
      await verify(db);
      await removeDatabase(LEGACY);
    }
    return db;
  } catch {
    await db.closeAsync();
    throw new Error('Could not finish opening your secured records. Your database is preserved. Tap Retry.');
  }
}

/** Build recovery separately; changing the active key never touches the inaccessible original. */
export async function recoverEncryptedDatabase(backup: FinanceBackup): Promise<void> {
  requireEncryptedBuild();
  const validated = parseBackup(JSON.stringify(backup));
  const key = await randomKey();
  const suffix = Array.from(await getRandomBytesAsync(16), byte => byte.toString(16).padStart(2, '0')).join('');
  const database = 'kuwenta-recovered-' + suffix + '.db';
  if (hasDatabaseFiles(database)) throw new Error('Could not prepare recovery. Please try again.');
  const db = await openKeyed(database, key);
  let ready = false;
  try {
    await initializeDatabase(db);
    await restoreBackup(db, validated);
    await verify(db);
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    ready = true;
  } finally {
    await db.closeAsync();
    if (!ready) await removeDatabase(database);
  }
  // Verify persistence on a new keyed connection before atomically selecting the recovery copy.
  const check = await openKeyed(database, key);
  try { await verify(check); } finally { await check.closeAsync(); }
  await SecureStore.setItemAsync(KEY, JSON.stringify({ database, key }), OPTIONS);
}
