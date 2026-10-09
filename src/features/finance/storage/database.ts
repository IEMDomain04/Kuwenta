import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDatabase } from './migrations';

// The subset used by storage; Expo's database supplies these methods directly.
export type FinanceDatabase = Pick<SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'getAllAsync' | 'runAsync' | 'withExclusiveTransactionAsync'>;

export async function initializeDatabase(db: FinanceDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  await migrateDatabase(db);
}

/** The caller owns this connection and must close it when finished. */
export async function openFinanceDatabase(): Promise<SQLiteDatabase> {
  const { openDatabaseAsync } = await import('expo-sqlite');
  const db = await openDatabaseAsync('kuwenta.db');
  try {
    await initializeDatabase(db);
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}
