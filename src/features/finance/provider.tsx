import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { calculateAccountSummary } from './calculations';
import { isValidMonth, philippineDateTime } from './dates';
import { openFinanceDatabase } from './storage/database';
import { getCashAccount, updateOpeningBalance } from './storage/accounts';
import { readBackupJson } from './storage/backup';
import { createTransactionId, createTransaction, updateTransaction, deleteTransaction, listTransactions } from './storage/transactions';
import type { Account, Transaction, TransactionDraft } from './types';
import { FinanceScreen, ActionButton } from './components/ui';

type Snapshot = { account: Account; transactions: Transaction[]; month: string; summary: ReturnType<typeof calculateAccountSummary> };
type Actions = {
  getBackupJson: () => Promise<string>;
  refresh: () => Promise<void>;
  saveOpeningBalance: (amount: number) => Promise<void>;
  newSubmissionId: () => Promise<string>;
  saveTransaction: (id: string, draft: TransactionDraft, editing: boolean) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
};
export type FinanceState = Snapshot & Actions & { busy: boolean; currentMonth: string; setMonth: (month: string) => void };
const Context = createContext<FinanceState | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  // null follows the current PH month; explicit selections survive refreshes.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const report = useMemo(() => {
    if (!snapshot) return null;
    try { return { summary: calculateAccountSummary(snapshot.account, snapshot.transactions, selectedMonth ?? snapshot.month), error: '' }; }
    catch (cause) { return { summary: null, error: cause instanceof Error ? cause.message : 'Could not calculate this month.' }; }
  }, [snapshot, selectedMonth]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ message: string; undoId?: string; expiresAt?: number } | null>(null);
  const actions = useRef<Actions | null>(null);
  const undoPending = useRef(false);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice((current) => current === notice ? null : current), Math.max(0, (notice.expiresAt ?? Date.now() + 4000) - Date.now()));
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let active = true;
    let connection: SQLiteDatabase | undefined;
    let locked = false;
    let running: Promise<unknown> = Promise.resolve();
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
      locked = true; setBusy(true);
      running = load().catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load records.');
      }).finally(() => { locked = false; if (active) setBusy(false); });
      await running;
    }
    async function write(operation: (db: SQLiteDatabase) => Promise<unknown>, message: string, undoId?: string) {
      if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
      locked = true; setBusy(true);
      const pending = (async () => {
        await operation(connection!);
        if (active) setNotice({ message, undoId, expiresAt: Date.now() + (undoId ? 10_000 : 4000) });
        try { await load(); }
        catch { if (active) setError('Change saved, but records could not refresh. Tap Retry.'); }
      })();
      running = pending.catch(() => {});
      try { await pending; }
      finally { locked = false; if (active) setBusy(false); }
    }
    actions.current = {
      refresh,
      getBackupJson: async () => {
        if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
        locked = true; setBusy(true);
        const pending = readBackupJson(connection);
        running = pending.catch(() => {});
        try { return await pending; }
        finally { locked = false; if (active) setBusy(false); }
      },
      saveOpeningBalance: (amount) => write((db) => updateOpeningBalance(db, amount), 'Opening balance saved.'),
      newSubmissionId: async () => {
        if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
        return createTransactionId(connection);
      },
      saveTransaction: (id, draft, editing) => write((db) => editing ? updateTransaction(db, id, draft) : createTransaction(db, id, draft),
        editing ? 'Transaction updated.' : 'Transaction saved for ' + draft.transactionDate + '.', editing ? undefined : id),
      removeTransaction: (id) => write((db) => deleteTransaction(db, id), 'Transaction removed.'),
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && loadedMonth !== philippineDateTime().transactionDate.slice(0, 7)) void refresh();
    }, 60_000);
    return () => {
      active = false; subscription.remove(); clearInterval(timer); actions.current = null;
      void running.finally(async () => { await connection?.closeAsync(); }).catch(() => {});
    };
  }, []);
  async function undo() {
    if (!notice?.undoId || busy || undoPending.current) return;
    if (Date.now() >= (notice.expiresAt ?? 0)) { setNotice({ message: notice.message }); return; }
    undoPending.current = true;
    try { await actions.current?.removeTransaction(notice.undoId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not undo.'); }
    finally { undoPending.current = false; }
  }
  if (!snapshot) return <FinanceScreen title="Kuwenta">
    {busy ? <><ActivityIndicator /><ThemedText>Loading your money…</ThemedText></>
      : <><ThemedText accessibilityRole="alert">{error || 'Preparing records…'}</ThemedText>
        <ActionButton label="Retry" onPress={() => { void actions.current?.refresh(); }} /></>}
  </FinanceScreen>;
  if (!report?.summary) return <FinanceScreen title="Reporting error"><ThemedText accessibilityRole="alert">{report?.error}</ThemedText><ActionButton label="Current month" onPress={() => setSelectedMonth(null)} /></FinanceScreen>;
  const unavailable = () => Promise.reject(new Error('App is closing.'));
  return <Context.Provider value={{ ...snapshot, busy, month: selectedMonth ?? snapshot.month, currentMonth: snapshot.month, summary: report.summary,
    setMonth: (month) => { if (!isValidMonth(month)) throw new Error('Invalid reporting month.'); setSelectedMonth(month === snapshot.month ? null : month); },
    refresh: () => actions.current?.refresh() ?? Promise.resolve(),
    getBackupJson: () => actions.current?.getBackupJson() ?? unavailable(),
    saveOpeningBalance: (amount) => actions.current?.saveOpeningBalance(amount) ?? unavailable(),
    newSubmissionId: () => actions.current?.newSubmissionId() ?? unavailable(),
    saveTransaction: (id, draft, editing) => actions.current?.saveTransaction(id, draft, editing) ?? unavailable(),
    removeTransaction: (id) => actions.current?.removeTransaction(id) ?? unavailable(),
  }}><ThemedView style={{ flex: 1 }}>
    {error ? <ThemedView style={{ padding: 16, gap: 8 }}><ThemedText accessibilityRole="alert">{error}</ThemedText>
      <ActionButton label="Retry" disabled={busy} onPress={() => { void actions.current?.refresh(); }} /></ThemedView> : null}
    {notice ? <SafeAreaView edges={['top', 'left', 'right']}>
      <ThemedView type="backgroundElement" style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ThemedText style={{ flex: 1 }} accessibilityLiveRegion="polite">{notice.message}</ThemedText>
        {notice.undoId ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy}
          onPress={() => { void undo(); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><ThemedText type="smallBold">Undo</ThemedText></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setNotice(null)}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><ThemedText>×</ThemedText></Pressable>
      </ThemedView>
    </SafeAreaView> : null}
    {children}
  </ThemedView></Context.Provider>;
}
export function useFinance(): FinanceState {
  const value = useContext(Context);
  if (!value) throw new Error('FinanceProvider is missing.');
  return value;
}
