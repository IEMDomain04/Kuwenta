import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { ActionButton, FinanceScreen, BackButton } from '../components/ui';
import { TransactionDateTime } from '../components/transaction-date-time';
import { philippineDateTime } from '../dates';
import { MoneyField } from '../components/money-field';
import { formatEditableMoney } from '../inputs';
import { formatMoney, moneyInput, parseMoney } from '../money';
import { validateGoal, validateAccount } from '../validation';
import { calculateGoalProgress } from '../calculations';
import type { SavingsGoal, Account } from '../types';

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const original = finance.goals.find((row) => row.id === id);
  const [name, setName] = useState(original?.name ?? '');
  const [amount, setAmount] = useState(original ? formatEditableMoney(moneyInput(original.targetAmount))! : '');
  const [date, setDate] = useState(original?.targetDate ?? '');
  const [accountId, setAccountId] = useState(original?.accountId ?? '');
  const [createAccount, setCreateAccount] = useState(!original && !finance.accounts.some((account) => account.purpose === 'savings' && !account.archived && !finance.goals.some((goal) => goal.accountId === account.id)));
  const [newAccountName, setNewAccountName] = useState('');
  const accountSubmission = useRef<string | undefined>(undefined);
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
  async function commit(goal: SavingsGoal, newAccount?: Account) {
    setWorking(true);
    try {
      const goalId = original?.id ?? (submission.current ??= await finance.newSubmissionId());
      const account = newAccount ? { ...newAccount, id: accountSubmission.current ??= await finance.newSubmissionId() } : undefined;
      await finance.saveGoal({ ...goal, id: goalId, accountId: account?.id ?? goal.accountId }, !original, account);
      leave();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the goal.'); }
    finally { pending.current = false; setWorking(false); }
  }
  function review() {
    if (pending.current || locked || rejected) return;
    let goal: SavingsGoal;
    let newAccount: Account | undefined;
    try {
      const now = new Date().toISOString();
      if (createAccount && !original) {
        newAccount = { id: 'new-goal-account', name: (newAccountName || name).trim(), currency: 'PHP', openingBalance: 0, purpose: 'savings', includedInAvailable: false, archived: false };
        validateAccount(newAccount);
      }
      goal = { id: original?.id ?? 'new-goal', name: name.trim(), accountId: newAccount?.id ?? accountId, targetAmount: parseMoney(amount.replace(/,/g, '')), targetDate: date || undefined, createdAt: original?.createdAt ?? now, updatedAt: [now, original?.updatedAt ?? ''].sort().at(-1)! };
      validateGoal(goal, newAccount ? [...finance.accounts, newAccount] : finance.accounts);
      if (!newAccount && !available.some((account) => account.id === accountId)) throw new Error('Choose an active, dedicated savings account.');
      calculateGoalProgress(goal, newAccount ? [...finance.accounts, newAccount] : finance.accounts, finance.transactions);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid goal.'); return; }
    Keyboard.dismiss(); pending.current = true;
    Alert.alert(original ? 'Save goal changes?' : 'Create savings goal?', goal.name + '\nTarget: ' + formatMoney(goal.targetAmount) + '\nAccount: ' + (newAccount?.name ?? finance.accounts.find((account) => account.id === accountId)!.name) + (newAccount ? '\nA new dedicated savings account will be created with a zero balance, excluded from Available Money.' : '\nAccount funds are unchanged.'), [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Confirm', onPress: () => { void commit(goal, newAccount); } },
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
  const inputStyle = { borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, color: theme.text };
  if (id && !original) return <FinanceScreen title="Goal unavailable" tabScreen={false}><ThemedText>This goal no longer exists.</ThemedText><ActionButton label="Back" onPress={leave} /></FinanceScreen>;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FinanceScreen title={original ? 'Edit savings goal' : 'Add savings goal'} tabScreen={false} headerLeading={<BackButton disabled={locked} onPress={() => { if (!pending.current) leave(); }} />}>
      <ThemedText type="smallBold">Goal name</ThemedText>
      <TextInput accessibilityLabel="Goal name" value={name} onChangeText={setName} editable={!locked} placeholder="Emergency fund" placeholderTextColor={theme.textSecondary} style={inputStyle} />
      <ThemedText type="smallBold">Target amount</ThemedText>
      <MoneyField accessibilityLabel="Goal target amount in pesos" value={amount} editable={!locked} placeholder="0" placeholderTextColor={theme.textSecondary} style={inputStyle}
        onValueChange={(value) => { setAmount(value); setRejected(false); setError(''); }} onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }} />
      <ThemedText type="smallBold">Dedicated savings account</ThemedText>
      {!original && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ActionButton compact label="Create new account" selected={createAccount} disabled={locked} onPress={() => setCreateAccount(true)} />
        <ActionButton compact label="Link existing account" selected={!createAccount} disabled={locked} onPress={() => setCreateAccount(false)} />
      </View>}
      {createAccount && !original ? <>
        <ThemedText type="small">Saving this goal creates a dedicated savings account with a zero balance. It is excluded from Available Money.</ThemedText>
        <TextInput accessibilityLabel="New savings account name" value={newAccountName} onChangeText={setNewAccountName} editable={!locked} placeholder={name || 'Savings account name'} placeholderTextColor={theme.textSecondary} style={inputStyle} />
      </> : <>
        <View style={{ gap: 8 }}>{available.map((account) => <ActionButton key={account.id} label={account.name} selected={accountId === account.id} disabled={locked} onPress={() => setAccountId(account.id)} />)}</View>
        {available.length === 0 && <ThemedText type="small">No eligible savings accounts. Choose Create new account, or unarchive an unlinked savings account.</ThemedText>}
        {original && !available.some((account) => account.id === original.accountId) && <ThemedText type="small">Unarchive the linked account to keep using it, or choose another account.</ThemedText>}
      </>}
      {date ? <>
        <TransactionDateTime dateOnly date={date} time="00:00:00" disabled={locked} onDateChange={setDate} onTimeChange={() => {}} />
        <ActionButton label="Remove target date" disabled={locked} onPress={() => setDate('')} />
      </> : <ActionButton label="Add target date (optional)" disabled={locked} onPress={() => setDate(philippineDateTime().transactionDate)} />}
      {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
      <ActionButton primary label={working ? 'Saving...' : original ? 'Review changes' : 'Review and save goal'} disabled={locked || rejected} onPress={review} />
      <ActionButton label="Cancel" disabled={locked} onPress={() => { if (!pending.current) leave(); }} />
      {original && <ActionButton label="Delete goal" disabled={locked} onPress={remove} />}
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
