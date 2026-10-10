import { listBudgets, saveBudget as saveBudgetRecord, deleteBudget, copyPreviousBudgets } from './storage/budgets';
import { CashSetup } from './components/cash-setup';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useTheme } from '@/hooks/use-theme';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { calculateFinanceSummary } from './calculations';
import { isValidMonth, philippineDateTime } from './dates';
import { openFinanceDatabase } from './storage/database';
import { listGoals, saveGoal as saveGoalRecord, deleteGoal } from './storage/goals';
import { deleteAccount, completeCashSetup, listAccounts, saveAccount as saveAccountRecords, updateOpeningBalance } from './storage/accounts';
import { resetFinancialData, readBackupJson, restoreBackup as restoreBackupRecords } from './storage/backup';
import type { FinanceBackup } from './backup';
import { adjustAccountBalance, createTransactionId, createTransaction, updateTransaction, deleteTransaction, listTransactions } from './storage/transactions';
import type { Account, Transaction, TransactionDraft, SavingsGoal, Budget } from './types';
import { FinanceScreen, ActionButton } from './components/ui';

type Snapshot = { budgets: Budget[]; needsCashSetup: boolean; lastEntryAccount?: string; goals: SavingsGoal[]; accounts: Account[]; account: Account; transactions: Transaction[]; month: string; summary: ReturnType<typeof calculateFinanceSummary> };
type Actions = {
  saveBudget: (budget: Budget, creating: boolean) => Promise<void>;
  removeBudget: (month: string, category: string) => Promise<void>;
  copyBudgets: (month: string) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  completeSetup: (cents: number) => Promise<void>;
  resetData: () => Promise<void>;
  saveGoal: (goal: SavingsGoal, creating: boolean, newAccount?: Account) => Promise<void>;
  removeGoal: (id: string) => Promise<void>;
  adjustBalance: (id: string, accountId: string, target: number, expected: number) => Promise<void>;
  restoreBackup: (backup: FinanceBackup) => Promise<void>;
  getBackupJson: () => Promise<string>;
  refresh: () => Promise<void>;
  saveAccount: (account: Account, creating: boolean) => Promise<void>;
  saveOpeningBalance: (amount: number) => Promise<void>;
  newSubmissionId: () => Promise<string>;
  saveTransaction: (id: string, draft: TransactionDraft, editing: boolean) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
};
export type FinanceState = Snapshot & Actions & { busy: boolean; currentMonth: string; setMonth: (month: string) => void };
const Context = createContext<FinanceState | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreVersion, setRestoreVersion] = useState(0);
  // null follows the current PH month; explicit selections survive refreshes.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const report = useMemo(() => {
    if (!snapshot) return null;
    try { return { summary: calculateFinanceSummary(snapshot.accounts, snapshot.transactions, selectedMonth ?? snapshot.month), error: '' }; }
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
      const accounts = await listAccounts(connection);
      const account = accounts.find((row) => row.id === 'cash');
      if (!account) throw new Error('Cash account is missing.');
      const transactions = await listTransactions(connection);
      const lastEntryAccount = (await connection.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'lastEntryAccount'"))?.value;
      const needsCashSetup = (await connection.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'cashSetupComplete'"))?.value === '0';
      const goals = await listGoals(connection);
      const budgets = await listBudgets(connection);
      const month = philippineDateTime().transactionDate.slice(0, 7);
      const summary = calculateFinanceSummary(accounts, transactions, month);
      loadedMonth = month;
      if (active) { setSnapshot({ budgets, needsCashSetup, lastEntryAccount, goals, accounts, account, transactions, month, summary }); setError(''); }
    }
    async function refresh() {
      if (locked || !active) return;
      locked = true; setBusy(true);
      running = load().catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load records.');
      }).finally(() => { locked = false; if (active) setBusy(false); });
      await running;
    }
    async function write(operation: (db: SQLiteDatabase) => Promise<unknown>, message: string, undoId?: string, restoring = false) {
      if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
      locked = true; setBusy(true);
      const pending = (async () => {
        await operation(connection!);
        if (active && restoring) { setSnapshot(null); setSelectedMonth(null); setRestoreVersion((version) => version + 1); }
        if (active) setNotice({ message, undoId, expiresAt: Date.now() + (undoId ? 10_000 : 4000) });
        try { await load(); }
        catch { if (active) setError(restoring ? 'Records replaced, but could not refresh. Tap Retry.' : 'Change saved, but records could not refresh. Tap Retry.'); }
      })();
      running = pending.catch(() => {});
      try { await pending; }
      finally { locked = false; if (active) setBusy(false); }
    }
    actions.current = {
      refresh,
      saveBudget: (budget, creating) => write((db) => saveBudgetRecord(db, budget, creating), 'Budget saved.'),
      removeBudget: (month, category) => write((db) => deleteBudget(db, month, category), 'Budget deleted. Transactions are kept.'),
      copyBudgets: (month) => write((db) => copyPreviousBudgets(db, month), 'Missing budgets copied from the previous month.'),
      removeAccount: (id) => write((db) => deleteAccount(db, id), 'Account deleted.'),
      completeSetup: (cents) => write((db) => completeCashSetup(db, cents), 'Cash account ready.'),
      resetData: () => write((db) => resetFinancialData(db), 'All data reset. Cash starts at zero.', undefined, true),
      saveGoal: (goal, creating, newAccount) => write((db) => saveGoalRecord(db, goal, creating, newAccount), creating ? 'Goal added.' : 'Goal updated.'),
      removeGoal: (id) => write((db) => deleteGoal(db, id), 'Goal removed. Account funds are unchanged.'),
      adjustBalance: (id, accountId, target, expected) => write((db) => adjustAccountBalance(db, id, accountId, target, expected), 'Balance adjusted.'),
      restoreBackup: (backup) => write((db) => restoreBackupRecords(db, backup), 'Backup restored.', undefined, true),
      getBackupJson: async () => {
        if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
        locked = true; setBusy(true);
        const pending = readBackupJson(connection);
        running = pending.catch(() => {});
        try { return await pending; }
        finally { locked = false; if (active) setBusy(false); }
      },
      saveAccount: (account, creating) => write((db) => saveAccountRecords(db, account, creating), creating ? 'Account added.' : 'Account updated.'),
      saveOpeningBalance: (amount) => write((db) => updateOpeningBalance(db, amount), 'Opening balance saved.'),
      newSubmissionId: async () => {
        if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
        return createTransactionId(connection);
      },
      saveTransaction: (id, draft, editing) => write((db) => editing ? updateTransaction(db, id, draft) : createTransaction(db, id, draft),
        editing ? 'Transaction updated.' : (draft.type === 'TRANSFER' ? 'Transfer saved' : draft.type === 'INCOME' ? 'Income saved' : 'Expense saved'), editing ? undefined : id),
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
  if (snapshot.needsCashSetup) return <CashSetup busy={busy} onComplete={(cents) => actions.current?.completeSetup(cents) ?? Promise.reject(new Error('App is closing.'))} />;
  if (!report?.summary) return <FinanceScreen title="Reporting error"><ThemedText accessibilityRole="alert">{report?.error}</ThemedText><ActionButton label="Current month" onPress={() => setSelectedMonth(null)} /></FinanceScreen>;
  const unavailable = () => Promise.reject(new Error('App is closing.'));
  return <Context.Provider value={{ ...snapshot, busy, month: selectedMonth ?? snapshot.month, currentMonth: snapshot.month, summary: report.summary,
    setMonth: (month) => { if (!isValidMonth(month)) throw new Error('Invalid reporting month.'); setSelectedMonth(month === snapshot.month ? null : month); },
    saveBudget: (budget, creating) => actions.current?.saveBudget(budget, creating) ?? unavailable(),
    removeBudget: (month, category) => actions.current?.removeBudget(month, category) ?? unavailable(),
    copyBudgets: (month) => actions.current?.copyBudgets(month) ?? unavailable(),
    saveGoal: (goal, creating, newAccount) => actions.current?.saveGoal(goal, creating, newAccount) ?? unavailable(),
    removeAccount: (id) => actions.current?.removeAccount(id) ?? unavailable(),
    removeGoal: (id) => actions.current?.removeGoal(id) ?? unavailable(),
    adjustBalance: (id, accountId, target, expected) => actions.current?.adjustBalance(id, accountId, target, expected) ?? unavailable(),
    refresh: () => actions.current?.refresh() ?? Promise.resolve(),
    completeSetup: (cents) => actions.current?.completeSetup(cents) ?? unavailable(),
    resetData: () => actions.current?.resetData() ?? unavailable(),
    restoreBackup: (backup) => actions.current?.restoreBackup(backup) ?? unavailable(),
    getBackupJson: () => actions.current?.getBackupJson() ?? unavailable(),
    saveAccount: (account, creating) => actions.current?.saveAccount(account, creating) ?? unavailable(),
    saveOpeningBalance: (amount) => actions.current?.saveOpeningBalance(amount) ?? unavailable(),
    newSubmissionId: () => actions.current?.newSubmissionId() ?? unavailable(),
    saveTransaction: (id, draft, editing) => actions.current?.saveTransaction(id, draft, editing) ?? unavailable(),
    removeTransaction: (id) => actions.current?.removeTransaction(id) ?? unavailable(),
  }}><ThemedView key={restoreVersion} style={{ flex: 1 }}>
    {error ? <ThemedView style={{ padding: 16, gap: 8 }}><ThemedText accessibilityRole="alert">{error}</ThemedText>
      <ActionButton label="Retry" disabled={busy} onPress={() => { void actions.current?.refresh(); }} /></ThemedView> : null}
    {children}
    {notice ? <View pointerEvents="box-none" style={{ position: 'absolute', left: Math.max(12, insets.left), right: Math.max(12, insets.right), bottom: insets.bottom + 148 }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.incomeSurface, borderColor: theme.border, borderWidth: 1, elevation: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="checkmark-circle" size={24} color={theme.income} />
        <ThemedText type="small" style={{ flex: 1 }} accessibilityLiveRegion="polite">{notice.message}</ThemedText>
        {notice.undoId ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { void undo(); }} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}><ThemedText type="smallBold" themeColor="accent">Undo</ThemedText></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setNotice(null)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={18} color={theme.textSecondary} /></Pressable>
      </View>
    </View> : null}
  </ThemedView></Context.Provider>;
}
export function useFinance(): FinanceState {
  const value = useContext(Context);
  if (!value) throw new Error('FinanceProvider is missing.');
  return value;
}
