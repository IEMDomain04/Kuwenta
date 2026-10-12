import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrations';

// The subset used by storage; Expo's database supplies these methods directly.
export type FinanceDatabase = Pick<SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'runAsync' | 'withExclusiveTransactionAsync'>;

export async function initializeDatabase(db: FinanceDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  await migrateDatabase(db);
}

export class DatabaseRecoveryError extends Error {}

// Serialize first opens so interrupted mounts cannot run two migrations at once.
let opening: Promise<unknown> = Promise.resolve();
/** The caller owns this connection and must close it when finished. */
export function openFinanceDatabase(): Promise<SQLiteDatabase> {
  const operation = opening.then(async () => {
    const { openEncryptedDatabase } = await import('./encrypted-database');
    return openEncryptedDatabase();
  });
  opening = operation.catch(() => {});
  return operation;
}

/** Only called after a checked backup and an explicit replacement confirmation. */
export function recoverFinanceDatabase(backup: import('../backup').FinanceBackup): Promise<void> {
  const operation = opening.then(async () => {
    const { recoverEncryptedDatabase } = await import('./encrypted-database');
    await recoverEncryptedDatabase(backup);
  });
  opening = operation.catch(() => {});
  return operation;
}
