import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import { AccountManager } from '../components/account-manager';
import { MoneyField } from '../components/money-field';
import { ActionButton, FinanceScreen, BackButton, TransactionRow } from '../components/ui';
import { calculateAccountSummary } from '../calculations';
import { formatEditableMoney } from '../inputs';
import { formatMoney, moneyInput, parseMoney } from '../money';
import { useFinance } from '../provider';

export default function AccountScreen() {
  const { id, purpose } = useLocalSearchParams<{ id?: string; purpose?: string }>();
  const accountId = typeof id === 'string' ? id : undefined;
  const finance = useFinance();
  const theme = useTheme();
  const account = finance.accounts.find((row) => row.id === accountId);
  const history = finance.transactions.filter((row) => row.accountId === accountId || row.destinationAccountId === accountId).sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.transactionTime.localeCompare(a.transactionTime) || b.createdAt.localeCompare(a.createdAt));
  const balance = account ? calculateAccountSummary(account, finance.transactions, finance.month).balance : 0;
  const [mode, setMode] = useState<'details' | 'edit' | 'adjust'>('details');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [correctOpening, setCorrectOpening] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState(false);
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const submission = useRef<string | undefined>(undefined);
  const locked = finance.busy || working;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pending.current || locked) return true;
      if (mode !== 'details') { setMode('details'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [mode, locked]);
  function leave() { if (router.canGoBack()) router.back(); else router.replace('/'); }
  async function commit(target: number, expected: number) {
    setWorking(true);
    try {
      const saveId = submission.current ??= await finance.newSubmissionId();
      await finance.adjustBalance(saveId, account!.id, target, expected);
      submission.current = undefined; setMode('details'); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not adjust the balance.'); }
    finally { pending.current = false; setWorking(false); }
  }
  function remove() {
    if (!account || locked || pending.current) return;
    const reason = account.id === 'cash' ? 'The default Cash account cannot be deleted. Use Reset all data to start over.'
      : finance.transactions.some((row) => row.accountId === account.id || row.destinationAccountId === account.id) ? 'This account has transaction history. Archive it instead to preserve your records.'
      : finance.goals.some((goal) => goal.accountId === account.id) ? 'Delete or relink the savings goal before deleting this account.'
      : balance !== 0 ? 'This account still has a balance. Resolve it before deleting the account.' : '';
    if (reason) { setError(reason); return; }
    pending.current = true;
    Alert.alert('Delete account?', 'Permanently delete ' + account.name + '? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Delete account', style: 'destructive', onPress: () => {
        setWorking(true); setError('');
        void finance.removeAccount(account.id).then(leave).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not delete the account.')).finally(() => { pending.current = false; setWorking(false); });
      } },
    ], { cancelable: false });
  }
  function archive() {
    if (!account || locked || pending.current) return;
    pending.current = true;
    Alert.alert(account.archived ? 'Unarchive account?' : 'Archive account?', account.archived ? 'Make this account available for transactions again.' : 'The balance, transactions and linked goal are kept. New transactions and edits are blocked until unarchived.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: account.archived ? 'Unarchive' : 'Archive', onPress: () => {
        setWorking(true);
        void finance.saveAccount({ ...account, archived: !account.archived }, false).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not update the account.')).finally(() => { pending.current = false; setWorking(false); setOptionsOpen(false); });
      } },
    ], { cancelable: false });
  }
  function review() {
    if (!account || locked || pending.current || rejected) return;
    let target: number;
    try {
      target = parseMoney(amount.replace(/,/g, ''), { allowZero: true, allowNegative: true });
      const delta = BigInt(target) - BigInt(balance);
      if (delta > BigInt(Number.MAX_SAFE_INTEGER) || delta < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Adjustment exceeds the supported range.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid balance.'); return; }
    if (target === balance) { setMode('details'); return; }
    pending.current = true;
    Alert.alert('Adjust current balance?', account.name + '\n' + formatMoney(balance) + ' to ' + formatMoney(target) + '\nAdjustment: ' + formatMoney(target - balance) + '\nThis records a correction separate from income and expenses. The opening balance stays unchanged.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Confirm', onPress: () => { void commit(target, balance); } },
    ], { cancelable: false });
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FinanceScreen title={!accountId ? 'Add account' : mode === 'adjust' ? 'Adjust balance' : mode === 'edit' ? 'Edit account' : 'Account details'} tabScreen={false} headerLeading={<BackButton disabled={locked} onPress={() => { if (pending.current) return; if (mode !== 'details') setMode('details'); else leave(); }} />}>
      {!accountId ? <AccountManager initialPurpose={purpose === "savings" ? "savings" : "spending"} onClose={leave} />
        : !account ? <><ThemedText>This account is no longer available.</ThemedText><ActionButton label="Back" onPress={leave} /></>
        : mode === 'edit' ? <AccountManager accountId={accountId} initialCorrectOpening={correctOpening} onClose={() => setMode('details')} />
        : <>
          <View style={{ padding: 18, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 8 }}>
            <ThemedText type="smallBold">{account.name}{account.archived ? ' · Archived' : ''}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Current balance</ThemedText>
            <ThemedText style={{ fontSize: 28, lineHeight: 36, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatMoney(balance)}</ThemedText>
            {balance < 0 && <ThemedText accessibilityRole="alert">Warning: this account balance is negative.</ThemedText>}
            <ThemedText type="small">{account.currency} · {account.purpose === 'spending' ? 'Spending' : 'Savings'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{account.includedInAvailable ? 'Included in' : 'Excluded from'} Available Money</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Original opening balance: {formatMoney(account.openingBalance)}</ThemedText>
          </View>
          {mode === 'adjust' ? <>
            <ThemedText type="smallBold">Actual balance now</ThemedText>
            <MoneyField signed accessibilityLabel="Actual account balance in pesos" value={amount} editable={!locked}
              onValueChange={(value) => { setAmount(value); setRejected(false); setError(''); }}
              onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }}
              style={{ color: theme.text, fontSize: 24, borderWidth: 1, borderColor: theme.border, padding: 14, borderRadius: 12 }} />
            <ActionButton compact label={amount.startsWith('-') ? 'Make positive' : 'Make negative'} disabled={locked} onPress={() => { setAmount(amount.startsWith('-') ? amount.slice(1) : '-' + amount); setRejected(false); setError(''); }} />
            <ActionButton primary label={working ? 'Saving…' : 'Review adjustment'} disabled={locked || rejected} onPress={review} />
            <ActionButton label="Cancel" disabled={locked} onPress={() => { if (!pending.current) { setMode('details'); setError(''); } }} />
          </> : <>
            {!account.archived && <>
              <ThemedText type="small" themeColor="textSecondary">Adjust balance records a correction. Edit account details changes the name and spending preferences.</ThemedText>
              <ActionButton compact label="Adjust balance" disabled={locked} onPress={() => { submission.current = undefined; setAmount(formatEditableMoney(moneyInput(balance), true)!); setRejected(false); setError(''); setMode('adjust'); }} />
              <ActionButton primary label="Transfer money" disabled={locked || finance.accounts.filter((row) => !row.archived).length < 2}
                onPress={() => router.push({ pathname: '/transaction', params: { type: 'TRANSFER', accountId: account.id } })} />
              {finance.accounts.filter((row) => !row.archived).length < 2 && <ThemedText type="small">Add another active account to transfer money.</ThemedText>}

            </>}
            {account.archived && <ThemedText type="small">Unarchive this account in Account options before making changes.</ThemedText>}
            <View style={{ padding: 12, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <ThemedText type="smallBold">Account transactions</ThemedText>
                <ActionButton compact label="See all" disabled={locked} onPress={() => router.push({ pathname: '/transactions', params: { accountId: account.id } })} />
              </View>
              {history.length ? history.slice(0, 5).map((row) => <TransactionRow key={row.id} transaction={row} showDate accountName={finance.accounts.find((item) => item.id === row.accountId)?.name ?? 'Unknown account'} destinationName={finance.accounts.find((item) => item.id === row.destinationAccountId)?.name} disabled={locked || row.type === 'ADJUSTMENT'} onEdit={() => router.push({ pathname: '/transaction', params: { id: row.id } })} />) : <ThemedText type="small" themeColor="textSecondary">No transactions for this account yet.</ThemedText>}
            </View>
            <ActionButton label={optionsOpen ? 'Close account options' : 'Account options'} selected={optionsOpen} disabled={locked} onPress={() => setOptionsOpen(!optionsOpen)} />
            {optionsOpen && <View style={{ gap: 8 }}>
              {!account.archived && <>
                <ActionButton label="Edit account details" disabled={locked} onPress={() => { setCorrectOpening(false); setMode('edit'); }} />
                <ActionButton label="Correct opening balance" disabled={locked} onPress={() => { setCorrectOpening(true); setMode('edit'); }} />
              </>}
              <ActionButton label="Delete account" disabled={locked} onPress={remove} />
              <ActionButton label={account.archived ? 'Unarchive account' : 'Archive account'} disabled={locked} onPress={archive} />
            </View>}

          </>}
          {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
        </>}
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
