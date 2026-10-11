import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { ActionButton, BackButton, FinanceScreen } from '../components/ui';
import { SelectionSheet } from '../components/selection-sheet';
import { MoneyField } from '../components/money-field';
import { TransactionDateTime } from '../components/transaction-date-time';
import { philippineDateTime } from '../dates';
import { calculateAccountSummary } from '../calculations';
import { formatMoney, parseMoney } from '../money';
import TransactionScreen from './transaction-screen';

export default function TransferScreen() {
  const params = useLocalSearchParams<{ accountId?: string; destinationAccountId?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const [external, setExternal] = useState<'increase' | 'decrease' | null>(null);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(params.destinationAccountId ?? params.accountId ?? '');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [dateTime, setDateTime] = useState(philippineDateTime);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const submission = useRef<string | undefined>(undefined);
  const locked = saving || finance.busy;
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => pending.current || saving);
    return () => listener.remove();
  }, [saving]);
  const account = finance.accounts.find((row) => row.id === accountId);
  let after: number | undefined;
  try {
    if (account && external) {
      const balance = calculateAccountSummary(account, finance.transactions, '1900-01').balance;
      const next = BigInt(balance) + BigInt(parseMoney(amount.replace(/,/g, ''))) * (external === 'increase' ? 1n : -1n);
      if (next > BigInt(Number.MAX_SAFE_INTEGER) || next < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Balance exceeds supported range.');
      after = Number(next);
    }
  } catch { /* Incomplete inputs are validated on Save. */ }
  function save() {
    if (locked || pending.current || !external || rejected) return;
    let cents: number;
    try {
      cents = parseMoney(amount.replace(/,/g, ''));
      if (!name.trim()) throw new Error('Enter the external source or destination name.');
      if (!account || account.archived) throw new Error('Choose an active account.');
      if (after === undefined) throw new Error('Balance exceeds the supported range.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the inputs.'); return; }
    pending.current = true;
    Alert.alert('Save external transfer?', (external === 'increase' ? name.trim() + ' to ' + account.name : account.name + ' to ' + name.trim()) + '\n' + formatMoney(cents) + '\nExcluded from History, income, and expenses. An internal record is kept for balances and backups.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Save', onPress: () => {
        setSaving(true);
        void (async () => {
          try {
            const id = submission.current ??= await finance.newSubmissionId();
            const now = new Date().toISOString();
            await finance.saveExternal({ id, type: 'EXTERNAL', accountId, category: 'External transfer', amount: cents, externalName: name.trim(), adjustmentDirection: external, ...dateTime, notes: notes.trim() || undefined, createdAt: now, updatedAt: now });
            submission.current = undefined;
            if (router.canGoBack()) router.back(); else router.replace('/');
          } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Draft kept.'); }
          finally { pending.current = false; setSaving(false); }
        })();
      } },
    ], { cancelable: false });
  }
  const choices = <View style={{ gap: 8 }}>
    <ThemedText type="smallBold">Source</ThemedText>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ActionButton compact label="My accounts" selected={external !== 'increase'} disabled={locked} onPress={() => setExternal(null)} />
      <ActionButton compact label="External source" selected={external === 'increase'} disabled={locked} onPress={() => setExternal('increase')} />
    </View>
    <ThemedText type="smallBold">Destination</ThemedText>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ActionButton compact label="My accounts" selected={external !== 'decrease'} disabled={locked} onPress={() => setExternal(null)} />
      <ActionButton compact label="External" selected={external === 'decrease'} disabled={locked} onPress={() => setExternal('decrease')} />
    </View>
    <ThemedText type="small" themeColor="textSecondary">{external ? (external === 'increase' ? 'Adds money from outside Kuwenta.' : 'Moves money outside Kuwenta.') + ' Excluded from History, income, and expense totals. For salary or purchases, use Income or Expense.' : 'Moves money between your accounts. Income and expense totals stay unchanged.'}</ThemedText>
  </View>;
  if (!external) return <TransactionScreen transferOnly transferChoices={choices} />;
  const input = { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, color: theme.text, fontSize: 12 };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen title="External transfer" tabScreen={false} headerLeading={<BackButton disabled={locked} onPress={() => { if (!pending.current) { if (router.canGoBack()) router.back(); else router.replace('/'); } }} />}>
      {choices}
      <ThemedText type="small">{external === 'increase' ? 'External source name' : 'External destination name'}</ThemedText>
      <TextInput accessibilityLabel="External name" value={name} onChangeText={setName} editable={!locked} placeholder="Untracked wallet" placeholderTextColor={theme.textSecondary} style={input} />
      <ActionButton label={account?.name ?? 'Choose tracked account'} disabled={locked} onPress={() => setPicker(true)} />
      <ThemedText type="small">Amount (PHP)</ThemedText>
      <MoneyField accessibilityLabel="External transfer amount" value={amount} editable={!locked} onValueChange={(value) => { setAmount(value); setRejected(false); setError(''); }} onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }} style={{ ...input, fontSize: 22 }} />
      <TransactionDateTime date={dateTime.transactionDate} time={dateTime.transactionTime} disabled={locked} onDateChange={(transactionDate) => setDateTime({ ...dateTime, transactionDate })} onTimeChange={(transactionTime) => setDateTime({ ...dateTime, transactionTime })} />
      <TextInput accessibilityLabel="Optional transfer note" value={notes} onChangeText={setNotes} editable={!locked} placeholder="Optional note" placeholderTextColor={theme.textSecondary} style={input} />
      {after !== undefined ? <ThemedText type="smallBold">Balance after saving: {formatMoney(after)}</ThemedText> : null}
      {after !== undefined && after < 0 ? <ThemedText type="small" accessibilityRole="alert" themeColor="warning">Warning: this account will have a negative balance.</ThemedText> : null}
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      <ActionButton primary label={saving ? 'Saving...' : 'Save transfer'} disabled={locked || rejected} onPress={save} />
      <ActionButton label="Cancel" disabled={locked} onPress={() => { if (!pending.current) { if (router.canGoBack()) router.back(); else router.replace('/'); } }} />
      <SelectionSheet visible={picker} title="Tracked account" selected={accountId} disabled={locked} options={finance.accounts.filter((row) => !row.archived).map((row) => ({ value: row.id, label: row.name }))} onClose={() => setPicker(false)} onSelect={setAccountId} />
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
