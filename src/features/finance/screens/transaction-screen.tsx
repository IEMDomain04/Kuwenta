import { QuickEntry } from '../components/quick-entry';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useTheme } from '@/hooks/use-theme';
import { formatTransactionDateTime } from '../dates';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { TransactionForm } from '../components/transaction-form';
import { FinanceScreen, ActionButton } from '../components/ui';
import { useFinance } from '../provider';
import { validateDraft } from '../validation';
import { calculateFinanceSummary } from '../calculations';
import { formatMoney } from '../money';
import type { TransactionDraft, ManualTransactionType } from '../types';

export default function TransactionScreen({ transferOnly = false, transferChoices }: { transferOnly?: boolean; transferChoices?: ReactNode } = {}) {
  const params = useLocalSearchParams<{ quick?: string; id?: string; type?: string; accountId?: string; destinationAccountId?: string }>();
  const initialType = transferOnly || params.type === 'TRANSFER' ? 'TRANSFER' : params.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const id = typeof params.id === 'string' ? params.id : undefined;
  const finance = useFinance();
  const theme = useTheme();
  const [entryType, setEntryType] = useState<ManualTransactionType>(initialType);
  const original = id ? finance.transactions.find((row) => row.id === id) : undefined;
  const [quickOpen, setQuickOpen] = useState(!id && params.quick === '1');
  const [quickDraft, setQuickDraft] = useState<TransactionDraft>();
  const [quickWarnings, setQuickWarnings] = useState<string[]>([]);
  function setError(message: string) { if (message) finance.showNotice(message, true); }
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const finished = useRef(false);
  const submissionId = useRef<string | undefined>(undefined);
  function leave() { if (router.canGoBack()) router.back(); else router.replace('/'); }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => pending.current);
    return () => subscription.remove();
  }, []);
  async function save(draft: TransactionDraft) {
    setSaving(true);
    try {
      const saveId = id ?? (submissionId.current ??= await finance.newSubmissionId());
      await finance.saveTransaction(saveId, draft, Boolean(id));
      finished.current = true;
      submissionId.current = undefined; // retire after commit; subsequent entries need a new submission ID
      leave();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Your draft is preserved.');
      // Keep the successful form disabled while its native screen exits.
      if (!finished.current) { pending.current = false; setSaving(false); }
    }
  }
  function submit(draft: TransactionDraft) {
    if (pending.current || finished.current || finance.busy) return;
    setError('');
    try {
      const account = finance.accounts.find((account) => account.id === draft.accountId);
      if (!account) throw new Error('Choose an account.');
      validateDraft(draft, account, finance.accounts.find((account) => account.id === draft.destinationAccountId));
      if (original && finance.accounts.find((account) => account.id === original.accountId)?.archived) throw new Error('Unarchive the original account before editing its transactions.');
      if (original?.type === 'TRANSFER' && finance.accounts.find((account) => account.id === original.destinationAccountId)?.archived) throw new Error('Unarchive the original destination before editing this transfer.');
      const candidate = { ...draft, id: id ?? 'pending', createdAt: original?.createdAt ?? new Date().toISOString(), updatedAt: [new Date().toISOString(), original?.updatedAt ?? ''].sort().at(-1)! };
      calculateFinanceSummary(finance.accounts, [...finance.transactions.filter((row) => row.id !== id), candidate], draft.transactionDate.slice(0, 7));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid input.'); return; }
    Keyboard.dismiss(); pending.current = true;
    if (!original) { void save(draft); return; }
    const accountLabel = (row: TransactionDraft | typeof original) => {
      const source = finance.accounts.find((account) => account.id === row.accountId)?.name ?? '';
      return row.type === 'TRANSFER' ? source + ' to ' + (finance.accounts.find((account) => account.id === row.destinationAccountId)?.name ?? '') : source;
    };
    const accountChange = accountLabel(original) + ' -> ' + accountLabel(draft) + '\n';
    Alert.alert('Save transaction changes?', accountChange + `${original.category} ${formatMoney(original.amount)} to ${draft.category} ${formatMoney(draft.amount)}\n${draft.type} | ${formatTransactionDateTime(draft.transactionDate, draft.transactionTime)}\n${draft.notes ?? ''}`, [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Confirm', onPress: () => { void save(draft); } },
    ], { cancelable: false });
  }
  if (original?.type === "ADJUSTMENT") return <FinanceScreen title="Balance adjustment" tabScreen={false}><ThemedText>Balance corrections are managed from the account.</ThemedText><ActionButton label="View account" onPress={() => router.replace({ pathname: "/account", params: { id: original.accountId } })} /><ActionButton label="Back" onPress={leave} /></FinanceScreen>;
  if (id && !original) return <FinanceScreen title="Transaction unavailable" tabScreen={false}><ThemedText>This transaction no longer exists.</ThemedText><ActionButton label="Back" onPress={leave} /></FinanceScreen>;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen scroll={quickOpen} tabScreen={false} title={quickOpen ? 'Quick Entry' : id ? 'Edit transaction' : entryType === 'TRANSFER' ? 'Add Transfer' : entryType === 'INCOME' ? 'Add Income' : 'Add Expense'} headerLeading={<Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={saving || finance.busy} onPress={() => { if (!pending.current) leave(); }} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-back" size={24} color={theme.text} /></Pressable>}>
      {quickOpen ? <QuickEntry disabled={saving || finance.busy} accountId={params.accountId} onCancel={() => setQuickOpen(false)} onReview={(draft, warnings) => { setQuickDraft(draft); setQuickWarnings(warnings); setEntryType(draft.type); setQuickOpen(false); }} /> : <>

      {quickDraft && quickWarnings.length > 0 ? <ThemedText type="small" accessibilityLiveRegion="polite">{quickWarnings.join(' ')}</ThemedText> : null}
      {transferChoices}
      <TransactionForm transferOnly={transferOnly || quickDraft?.type === 'TRANSFER'} initialDraft={quickDraft} key={id ?? (quickDraft ? 'quick' : 'new')} original={original} initialType={initialType} initialAccountId={params.accountId} initialDestinationAccountId={params.destinationAccountId} onTypeChange={setEntryType} disabled={saving || finance.busy} onSubmit={submit} onCancel={() => { if (!pending.current) leave(); }} />
      </>}
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
