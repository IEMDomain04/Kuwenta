import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ThemedText } from '@/components/themed-text';
import { calculateAccountSummary } from './calculations';
import { philippineDateTime } from './dates';
import { openFinanceDatabase } from './storage/database';
import { getCashAccount, updateOpeningBalance } from './storage/accounts';
import { listTransactions } from './storage/transactions';
import type { Account, Transaction } from './types';
import { FinanceScreen, ActionButton } from './components/ui';

type Snapshot = {
  account: Account; transactions: Transaction[]; month: string;
  summary: ReturnType<typeof calculateAccountSummary>;
};
export type FinanceState = Snapshot & {
  busy: boolean;
  refresh: () => Promise<void>;
  saveOpeningBalance: (amount: number) => Promise<void>;
};
const Context = createContext<FinanceState | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actions = useRef<Pick<FinanceState, 'refresh' | 'saveOpeningBalance'> | null>(null);

  useEffect(() => {
    let active = true;
    let connection: SQLiteDatabase | undefined;
    let locked = false;
    let running: Promise<void> = Promise.resolve();
    let loadedMonth = '';

    async function load() {
      connection ??= await openFinanceDatabase();
      const account = await getCashAccount(connection);
      const transactions = await listTransactions(connection);
      const month = philippineDateTime().transactionDate.slice(0, 7);
      const summary = calculateAccountSummary(account, transactions, month);
      loadedMonth = month;
      if (active) { setSnapshot({ account, transactions, month, summary }); setError(''); }
    }
    async function refresh() {
      if (locked || !active) return;
      locked = true;
      setBusy(true);
      running = load().catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your records.');
      }).finally(() => { locked = false; if (active) setBusy(false); });
      await running;
    }
    async function saveOpeningBalance(amount: number) {
      if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
      locked = true;
      setBusy(true);
      const operation = (async () => {
        await updateOpeningBalance(connection!, amount);
        // The write has committed. A read failure should not be reported as a failed save.
        try { await load(); }
        catch { if (active) setError('Opening balance saved, but records could not refresh. Tap Retry.'); }
      })();
      running = operation.catch(() => {});
      try { await operation; }
      finally { locked = false; if (active) setBusy(false); }
    }
    actions.current = { refresh, saveOpeningBalance };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    // Recalculate at a Philippine month boundary while the app stays open.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && loadedMonth !== philippineDateTime().transactionDate.slice(0, 7)) void refresh();
    }, 60_000);
    return () => {
      active = false;
      subscription.remove(); clearInterval(timer);
      actions.current = null;
      void running.finally(async () => { await connection?.closeAsync(); }).catch(() => {});
    };
  }, []);

  if (error || !snapshot) {
    return <FinanceScreen title="Kuwenta">
      {busy ? <><ActivityIndicator /><ThemedText>Loading your money…</ThemedText></>
        : <><ThemedText accessibilityRole="alert">{error || 'Preparing your records…'}</ThemedText>
          <ActionButton label="Retry" onPress={() => { void actions.current?.refresh(); }} /></>}
    </FinanceScreen>;
  }
  return <Context.Provider value={{ ...snapshot, busy,
    refresh: () => actions.current?.refresh() ?? Promise.resolve(),
    saveOpeningBalance: (amount) => actions.current?.saveOpeningBalance(amount) ?? Promise.reject(new Error('App is closing.')),
  }}>{children}</Context.Provider>;
}

export function useFinance(): FinanceState {
  const state = useContext(Context);
  if (!state) throw new Error('FinanceProvider is missing.');
  return state;
}
