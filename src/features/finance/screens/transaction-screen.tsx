import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { TransactionForm } from '../components/transaction-form';
import { FinanceScreen, ActionButton } from '../components/ui';
import { useFinance } from '../provider';
import { validateDraft } from '../validation';
import { calculateAccountSummary } from '../calculations';
import { formatMoney } from '../money';
import type { TransactionDraft } from '../types';

export default function TransactionScreen() {
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const initialType = params.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const id = typeof params.id === 'string' ? params.id : undefined;
  const finance = useFinance();
  const original = id ? finance.transactions.find((row) => row.id === id) : undefined;
  const [error, setError] = useState('');
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
      submissionId.current = undefined; // retire after commit; Undo cannot reuse this draft
      leave();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your draft is preserved.'); }
    finally { pending.current = false; setSaving(false); }
  }
  function submit(draft: TransactionDraft) {
    if (pending.current || finished.current || finance.busy) return;
    setError('');
    try {
      validateDraft(draft, finance.account);
      const candidate = { ...draft, id: id ?? 'pending', createdAt: original?.createdAt ?? new Date().toISOString(), updatedAt: [new Date().toISOString(), original?.updatedAt ?? ''].sort().at(-1)! };
      calculateAccountSummary(finance.account, [...finance.transactions.filter((row) => row.id !== id), candidate], finance.month);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid input.'); return; }
    Keyboard.dismiss(); pending.current = true;
    if (!original) { void save(draft); return; }
    Alert.alert('Save transaction changes?', `${original.category} ${formatMoney(original.amount)} → ${draft.category} ${formatMoney(draft.amount)}\n${draft.type} · ${draft.transactionDate} ${draft.transactionTime} PH\n${draft.notes ?? ''}`, [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Confirm', onPress: () => { void save(draft); } },
    ], { cancelable: false });
  }
  if (id && !original) return <FinanceScreen title="Transaction unavailable"><ThemedText>This transaction no longer exists.</ThemedText><ActionButton label="Back" onPress={leave} /></FinanceScreen>;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FinanceScreen title={id ? 'Edit transaction' : 'Add transaction'}>
      <TransactionForm key={id ?? 'new'} original={original} initialType={initialType} disabled={saving || finance.busy} error={error} onSubmit={submit} onCancel={leave} />
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
