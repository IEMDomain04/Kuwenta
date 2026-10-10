import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { ActionButton, FinanceScreen } from '../components/ui';
import { TransactionDateTime } from '../components/transaction-date-time';
import { philippineDateTime } from '../dates';
import { MoneyField } from '../components/money-field';
import { formatEditableMoney } from '../inputs';
import { formatMoney, moneyInput, parseMoney } from '../money';
import { validateGoal } from '../validation';
import { calculateGoalProgress } from '../calculations';
import type { SavingsGoal } from '../types';

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const original = finance.goals.find((row) => row.id === id);
  const [name, setName] = useState(original?.name ?? '');
  const [amount, setAmount] = useState(original ? formatEditableMoney(moneyInput(original.targetAmount))! : '');
  const [date, setDate] = useState(original?.targetDate ?? '');
  const [accountId, setAccountId] = useState(original?.accountId ?? '');
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState(false);
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const submission = useRef<string | undefined>(undefined);
  const locked = finance.busy || working;
  const available = finance.accounts.filter((account) => account.purpose === 'savings' && !account.archived && !finance.goals.some((goal) => goal.accountId === account.id && goal.id !== id));
  function leave() { if (router.canGoBack()) router.back(); else router.replace('/'); }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => pending.current || locked);
    return () => subscription.remove();
  }, [locked]);
  async function commit(goal: SavingsGoal) {
    setWorking(true);
    try {
      const goalId = original?.id ?? (submission.current ??= await finance.newSubmissionId());
      await finance.saveGoal({ ...goal, id: goalId }, !original);
      leave();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the goal.'); }
    finally { pending.current = false; setWorking(false); }
  }
  function review() {
    if (pending.current || locked || rejected) return;
    let goal: SavingsGoal;
    try {
      const now = new Date().toISOString();
      goal = { id: original?.id ?? 'new-goal', name: name.trim(), accountId, targetAmount: parseMoney(amount.replace(/,/g, '')), targetDate: date || undefined, createdAt: original?.createdAt ?? now, updatedAt: [now, original?.updatedAt ?? ''].sort().at(-1)! };
      validateGoal(goal, finance.accounts);
      if (!available.some((account) => account.id === accountId)) throw new Error('Choose an active, dedicated savings account.');
      calculateGoalProgress(goal, finance.accounts, finance.transactions);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid goal.'); return; }
    Keyboard.dismiss(); pending.current = true;
    if (!original) { void commit(goal); return; }
    Alert.alert('Save goal changes?', goal.name + '\nTarget: ' + formatMoney(goal.targetAmount) + '\nAccount: ' + finance.accounts.find((account) => account.id === accountId)!.name + '\nAccount funds are unchanged.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Confirm', onPress: () => { void commit(goal); } },
    ], { cancelable: false });
  }
  function remove() {
    if (!original || pending.current || locked) return;
    pending.current = true;
    Alert.alert('Delete goal?', 'This removes ' + original.name + '. The savings account and all its money and transactions are kept.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setWorking(true);
        void finance.removeGoal(original.id).then(leave).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not delete the goal.')).finally(() => { pending.current = false; setWorking(false); });
      } },
    ], { cancelable: false });
  }
  const inputStyle = { borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, color: theme.text };
  if (id && !original) return <FinanceScreen title="Goal unavailable" tabScreen={false}><ThemedText>This goal no longer exists.</ThemedText><ActionButton label="Back" onPress={leave} /></FinanceScreen>;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FinanceScreen title={original ? 'Edit savings goal' : 'Add savings goal'} tabScreen={false}>
      <ThemedText type="smallBold">Goal name</ThemedText>
      <TextInput accessibilityLabel="Goal name" value={name} onChangeText={setName} editable={!locked} placeholder="Emergency fund" placeholderTextColor={theme.textSecondary} style={inputStyle} />
      <ThemedText type="smallBold">Target amount</ThemedText>
      <MoneyField accessibilityLabel="Goal target amount in pesos" value={amount} editable={!locked} placeholder="0" placeholderTextColor={theme.textSecondary} style={inputStyle}
        onValueChange={(value) => { setAmount(value); setRejected(false); setError(''); }} onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }} />
      <ThemedText type="smallBold">Dedicated savings account</ThemedText>
      <View style={{ gap: 8 }}>
        {available.map((account) => <ActionButton key={account.id} label={account.name} selected={accountId === account.id} disabled={locked} onPress={() => setAccountId(account.id)} />)}
      </View>
      {available.length === 0 && <ThemedText type="small">Create or unarchive a savings account without another goal first.</ThemedText>}
      {original && !available.some((account) => account.id === original.accountId) && <ThemedText type="small">Current account: {finance.accounts.find((account) => account.id === original.accountId)?.name}. Unarchive it to keep using it, or choose another account.</ThemedText>}
      <ActionButton label="Add savings account" disabled={locked} onPress={() => router.push({ pathname: '/account', params: { purpose: 'savings' } })} />
      {date ? <>
        <TransactionDateTime dateOnly date={date} time="00:00:00" disabled={locked} onDateChange={setDate} onTimeChange={() => {}} />
        <ActionButton label="Remove target date" disabled={locked} onPress={() => setDate('')} />
      </> : <ActionButton label="Add target date (optional)" disabled={locked} onPress={() => setDate(philippineDateTime().transactionDate)} />}
      {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
      <ActionButton primary label={working ? 'Saving...' : original ? 'Review changes' : 'Save goal'} disabled={locked || rejected} onPress={review} />
      <ActionButton label="Cancel" disabled={locked} onPress={() => { if (!pending.current) leave(); }} />
      {original && <ActionButton label="Delete goal" disabled={locked} onPress={remove} />}
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
