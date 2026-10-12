import { useColorScheme } from '@/hooks/use-color-scheme';
import { syncWidgets } from './widgets';
import { syncNotifications, observeNotificationTaps } from './notifications';
import { formatMoney } from './money';
import { router, useRootNavigationState } from 'expo-router';
import { listBudgets, saveBudget as saveBudgetRecord, deleteBudget, copyPreviousBudgets } from './storage/budgets';
import { CashSetup } from './components/cash-setup';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useTheme } from '@/hooks/use-theme';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { calculateFinanceSummary, calculateCurrentMoney } from './calculations';
import { isValidMonth, philippineDateTime } from './dates';
import { openFinanceDatabase } from './storage/database';
import { listGoals, saveGoal as saveGoalRecord, deleteGoal } from './storage/goals';
import { saveAccountOrder as saveAccountOrderRecord, deleteAccount, saveDisplayName as saveDisplayNameRecord, completeCashSetup, listAccounts, saveAccount as saveAccountRecords, updateOpeningBalance } from './storage/accounts';
import { resetFinancialData, restoreBackup as restoreBackupRecords } from './storage/backup';
import { serializeBackup, type FinanceBackup } from './backup';
import { createExternalTransfer, adjustAccountBalance, createTransactionId, createTransaction, updateTransaction, deleteTransaction, listTransactions } from './storage/transactions';
import type { Account, Transaction, TransactionDraft, SavingsGoal, Budget } from './types';
import { FinanceScreen, ActionButton } from './components/ui';

type Snapshot = { displayName?: string; budgets: Budget[]; needsCashSetup: boolean; lastEntryAccount?: string; goals: SavingsGoal[]; accounts: Account[]; account: Account; transactions: Transaction[]; month: string; summary: ReturnType<typeof calculateFinanceSummary> };
type Actions = {
  saveAccountOrder: (ids: readonly string[]) => Promise<void>;
  saveDisplayName: (name: string) => Promise<void>;
  saveExternal: (record: Transaction) => Promise<void>;
  saveBudget: (budget: Budget, creating: boolean) => Promise<void>;
  removeBudget: (month: string, category: string) => Promise<void>;
  copyBudgets: (month: string) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  completeSetup: (cents: number, displayName?: string, accountName?: string) => Promise<void>;
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
export type FinanceState = Snapshot & Actions & { showNotice: (message: string, error?: boolean) => void; busy: boolean; currentMonth: string; setMonth: (month: string) => void };
const Context = createContext<FinanceState | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const [opaqueNotice, setOpaqueNotice] = useState(true);
  useEffect(() => {
    let active = true;
    const check = Platform.OS === 'ios' ? AccessibilityInfo.isReduceTransparencyEnabled() : AccessibilityInfo.isHighTextContrastEnabled();
    void check.then(value => { if (active) setOpaqueNotice(value); }).catch(() => {});
    const subscription = Platform.OS === 'ios' ? AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOpaqueNotice) : undefined;
    return () => { active = false; subscription?.remove(); };
  }, []);
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const loadedSnapshot = useRef<Snapshot | null>(null);
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
  const [notice, setNotice] = useState<{ message: string; detail?: string; expiresAt?: number; tone?: 'success' | 'info' | 'income' | 'expense' | 'error' } | null>(null);
  const actions = useRef<Actions | null>(null);
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
    async function load(baseline = false) {
      connection ??= await openFinanceDatabase();
      const accounts = await listAccounts(connection);
      const account = accounts.find((row) => row.id === 'cash');
      if (!account) throw new Error('Cash account is missing.');
      const transactions = await listTransactions(connection);
      const lastEntryAccount = (await connection.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'lastEntryAccount'"))?.value;
      const displayName = (await connection.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'displayName'"))?.value;
      const needsCashSetup = (await connection.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'cashSetupComplete'"))?.value === '0';
      const goals = await listGoals(connection);
      const budgets = await listBudgets(connection);
      const month = philippineDateTime().transactionDate.slice(0, 7);
      const summary = calculateFinanceSummary(accounts, transactions, month);
      void syncNotifications(budgets, transactions, baseline).catch(cause => console.warn('Could not sync Kuwenta notifications:', cause));
      try { await syncWidgets(summary.balance, calculateCurrentMoney(accounts, transactions).availableMoney, needsCashSetup); }
      catch (cause) { console.warn('Could not update Kuwenta widgets:', cause); }
      loadedMonth = month;
      if (active) {
        const next = { displayName, budgets, needsCashSetup, lastEntryAccount, goals, accounts, account, transactions, month, summary };
        loadedSnapshot.current = next; setSnapshot(next); setError('');
      }
    }
    async function refresh() {
      if (locked || !active) return;
      locked = true; setBusy(true);
      running = load().catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load records.');
      }).finally(() => { locked = false; if (active) setBusy(false); });
      await running;
    }
    async function write(operation: (db: SQLiteDatabase) => Promise<unknown>, message: string | undefined, detail?: string, restoring = false, tone: 'success' | 'info' | 'income' | 'expense' | 'error' = 'success') {
      if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
      locked = true; setBusy(true);
      const pending = (async () => {
        await operation(connection!);
        if (active && restoring) { setSnapshot(null); setSelectedMonth(null); setRestoreVersion((version) => version + 1); }
        if (active && message) setNotice({ message, detail, tone, expiresAt: Date.now() + 4000 });
        try { await load(restoring); }
        catch { if (active) setError(restoring ? 'Records replaced, but could not refresh. Tap Retry.' : 'Change saved, but records could not refresh. Tap Retry.'); }
      })();
      running = pending.catch(() => {});
      try { await pending; }
      catch (cause) { if (active) setNotice({ message: cause instanceof Error ? cause.message : 'Could not save changes.', tone: 'error', expiresAt: Date.now() + 7000 }); throw cause; }
      finally { locked = false; if (active) setBusy(false); }
    }
    actions.current = {
      saveAccountOrder: (ids) => write(db => saveAccountOrderRecord(db, ids), undefined),
      saveDisplayName: (name) => write((db) => saveDisplayNameRecord(db, name), 'Name updated.'),
      saveExternal: (record) => write((db) => createExternalTransfer(db, record.id, record), 'External transfer saved', formatMoney(record.amount, true), false, 'info'),
      refresh,
      saveBudget: (budget, creating) => write((db) => saveBudgetRecord(db, budget, creating), 'Budget saved.'),
      removeBudget: (month, category) => write((db) => deleteBudget(db, month, category), 'Budget deleted.'),
      copyBudgets: (month) => write((db) => copyPreviousBudgets(db, month), 'Budgets copied.'),
      removeAccount: (id) => write((db) => deleteAccount(db, id), 'Account deleted.'),
      completeSetup: (cents, name, accountName) => write((db) => completeCashSetup(db, cents, name, accountName), 'Cash account ready.'),
      resetData: () => write((db) => resetFinancialData(db), 'Data reset.', undefined, true),
      saveGoal: (goal, creating, newAccount) => write((db) => saveGoalRecord(db, goal, creating, newAccount), creating ? 'Goal added.' : 'Goal updated.'),
      removeGoal: (id) => write((db) => deleteGoal(db, id), 'Goal removed.'),
      adjustBalance: (id, accountId, target, expected) => write((db) => adjustAccountBalance(db, id, accountId, target, expected), 'Balance adjusted.'),
      restoreBackup: (backup) => write((db) => restoreBackupRecords(db, backup), 'Backup restored.', undefined, true),
      getBackupJson: async () => {
        if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
        // A validated, fully loaded snapshot avoids opening another SQLite transaction.
        const data = loadedSnapshot.current;
        if (!data) throw new Error('Please wait for records to finish loading.');
        return serializeBackup(data.accounts, data.transactions, new Date().toISOString(), data.goals, data.budgets);
      },
      saveAccount: (account, creating) => write((db) => saveAccountRecords(db, account, creating), creating ? 'Account added.' : 'Account updated.'),
      saveOpeningBalance: (amount) => write((db) => updateOpeningBalance(db, amount), 'Opening balance saved.'),
      newSubmissionId: async () => {
        if (locked || !active || !connection) throw new Error('Please wait for records to finish loading.');
        return createTransactionId(connection);
      },
      saveTransaction: (id, draft, editing) => write((db) => editing ? updateTransaction(db, id, draft) : createTransaction(db, id, draft),
        editing ? 'Transaction updated' : (draft.type === 'TRANSFER' ? 'Transfer saved' : draft.type === 'INCOME' ? 'Income saved' : 'Expense saved'), formatMoney(draft.amount, true) + (draft.type === 'TRANSFER' ? '' : ' in ' + draft.category), false, draft.type === 'INCOME' ? 'income' : draft.type === 'EXPENSE' ? 'expense' : 'info'),
      removeTransaction: (id) => write((db) => deleteTransaction(db, id), 'Transaction removed.'),
    };
    void refresh();
    let timer: ReturnType<typeof setInterval> | undefined;
    function stopMonthTimer() { if (timer) clearInterval(timer); timer = undefined; }
    function startMonthTimer() {
      stopMonthTimer();
      timer = setInterval(() => { if (loadedMonth !== philippineDateTime().transactionDate.slice(0, 7)) void refresh(); }, 60_000);
    }
    if (AppState.currentState === 'active') startMonthTimer();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { void refresh(); startMonthTimer(); } else stopMonthTimer();
    });
    return () => {
      active = false; subscription.remove(); stopMonthTimer(); actions.current = null;
      void running.finally(async () => { await connection?.closeAsync(); }).catch(() => {});
    };
  }, []);
  if (!snapshot) return <FinanceScreen title="Kuwenta">
    {busy ? <><ActivityIndicator /><ThemedText>Loading your money...</ThemedText></>
      : <><ThemedText accessibilityRole="alert">{error || 'Preparing records...'}</ThemedText>
        <ActionButton label="Retry" onPress={() => { void actions.current?.refresh(); }} /></>}
  </FinanceScreen>;
  if (snapshot.needsCashSetup) return <CashSetup busy={busy} onComplete={(cents, name, accountName) => actions.current?.completeSetup(cents, name, accountName) ?? Promise.reject(new Error('App is closing.'))} />;
  if (!report?.summary) return <FinanceScreen title="Reporting error"><ThemedText accessibilityRole="alert">{report?.error}</ThemedText><ActionButton label="Current month" onPress={() => setSelectedMonth(null)} /></FinanceScreen>;
  const noticeColor = notice?.tone === 'expense' || notice?.tone === 'error' ? theme.error : notice?.tone === 'info' ? theme.secondary : theme.income;
  const unavailable = () => Promise.reject(new Error('App is closing.'));
  return <Context.Provider value={{ ...snapshot, busy, month: selectedMonth ?? snapshot.month, currentMonth: snapshot.month, summary: report.summary,
    showNotice: (message, error = false) => setNotice({ message, tone: error ? 'error' : 'success', expiresAt: Date.now() + (error ? 7000 : 4000) }),
    saveAccountOrder: (ids) => actions.current?.saveAccountOrder(ids) ?? unavailable(),
    setMonth: (month) => { if (!isValidMonth(month)) throw new Error('Invalid reporting month.'); setSelectedMonth(month === snapshot.month ? null : month); },
    saveDisplayName: (name) => actions.current?.saveDisplayName(name) ?? unavailable(),
    saveExternal: (record) => actions.current?.saveExternal(record) ?? unavailable(),
    saveBudget: (budget, creating) => actions.current?.saveBudget(budget, creating) ?? unavailable(),
    removeBudget: (month, category) => actions.current?.removeBudget(month, category) ?? unavailable(),
    copyBudgets: (month) => actions.current?.copyBudgets(month) ?? unavailable(),
    saveGoal: (goal, creating, newAccount) => actions.current?.saveGoal(goal, creating, newAccount) ?? unavailable(),
    removeAccount: (id) => actions.current?.removeAccount(id) ?? unavailable(),
    removeGoal: (id) => actions.current?.removeGoal(id) ?? unavailable(),
    adjustBalance: (id, accountId, target, expected) => actions.current?.adjustBalance(id, accountId, target, expected) ?? unavailable(),
    refresh: () => actions.current?.refresh() ?? Promise.resolve(),
    completeSetup: (cents, name, accountName) => actions.current?.completeSetup(cents, name, accountName) ?? unavailable(),
    resetData: () => actions.current?.resetData() ?? unavailable(),
    restoreBackup: (backup) => actions.current?.restoreBackup(backup) ?? unavailable(),
    getBackupJson: () => actions.current?.getBackupJson() ?? unavailable(),
    saveAccount: (account, creating) => actions.current?.saveAccount(account, creating) ?? unavailable(),
    saveOpeningBalance: (amount) => actions.current?.saveOpeningBalance(amount) ?? unavailable(),
    newSubmissionId: () => actions.current?.newSubmissionId() ?? unavailable(),
    saveTransaction: (id, draft, editing) => actions.current?.saveTransaction(id, draft, editing) ?? unavailable(),
    removeTransaction: (id) => actions.current?.removeTransaction(id) ?? unavailable(),
  }}><ThemedView key={restoreVersion} style={{ flex: 1 }}>
    {error ? <ThemedView style={{ padding: 16, gap: 8, backgroundColor: theme.errorSurface }}><ThemedText style={{ color: theme.error }} accessibilityRole="alert">{error}</ThemedText>
      <ActionButton label="Retry" disabled={busy} onPress={() => { void actions.current?.refresh(); }} /></ThemedView> : null}
    {children}
    <NotificationTapObserver />
    {notice ? <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 80, left: Math.max(16, insets.left), right: Math.max(16, insets.right), zIndex: 1000, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 300, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: opaqueNotice ? theme.backgroundElement : dark ? 'rgba(17,36,27,0.92)' : 'rgba(240,250,244,0.92)', borderWidth: 1, borderColor: dark ? 'rgba(255,255,255,0.24)' : 'rgba(6,99,62,0.25)', elevation: 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: noticeColor + '25', justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name={notice.tone === 'error' ? 'alert-circle-outline' : notice.tone === 'income' ? 'arrow-up' : notice.tone === 'expense' ? 'arrow-down' : 'checkmark'} size={16} color={noticeColor} />
        </View>
        <View style={{ flex: 1, gap: 2 }} accessibilityLiveRegion="polite">
          <ThemedText type="smallBold" style={{ color: theme.text, fontSize: 12 }}>{notice.message}</ThemedText>
          {notice.detail ? <ThemedText type="small" numberOfLines={2} style={{ color: theme.textSecondary, fontSize: 11 }}>{notice.detail}</ThemedText> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notice" onPress={() => setNotice(null)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={16} color={theme.textSecondary} /></Pressable>
      </View>
    </View> : null}
  </ThemedView></Context.Provider>;
}
export function useFinance(): FinanceState {
  const value = useContext(Context);
  if (!value) throw new Error('FinanceProvider is missing.');
  return value;
}

function NotificationTapObserver() {
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (!navigation?.key) return;
    return observeNotificationTaps(screen => router.navigate(screen === 'budgets' ? '/budgets' : '/'));
  }, [navigation?.key]);
  return null;
}
