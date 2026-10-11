import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { ActionButton, BackButton, FinanceScreen } from '../components/ui';
import { SelectionSheet } from '../components/selection-sheet';
import { MoneyField } from '../components/money-field';
import { TransactionDateTime } from '../components/transaction-date-time';
import { philippineDateTime } from '../dates';
import { calculateAccountSummary, calculateFinanceSummary } from '../calculations';
import { formatMoney, parseMoney } from '../money';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { validateDraft } from '../validation';

export default function TransferScreen() {
  const params = useLocalSearchParams<{ accountId?: string; destinationAccountId?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const [external, setExternal] = useState<'increase' | 'decrease' | null>(null);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(params.accountId ?? '');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [dateTime, setDateTime] = useState(philippineDateTime);
  const [destinationId, setDestinationId] = useState(params.destinationAccountId ?? '');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
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
  const account = finance.accounts.find((row) => row.id === (external === 'increase' ? destinationId : accountId));
  let after: number | undefined;
  let destinationAfter: number | undefined;
  try {
    if (account && external) {
      const balance = calculateAccountSummary(account, finance.transactions, '1900-01').balance;
      const next = BigInt(balance) + BigInt(parseMoney(amount.replace(/,/g, ''))) * (external === 'increase' ? 1n : -1n);
      if (next > BigInt(Number.MAX_SAFE_INTEGER) || next < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Balance exceeds supported range.');
      after = Number(next);
    } else if (account && destinationId && destinationId !== accountId) {
      const destination = finance.accounts.find((row) => row.id === destinationId);
      if (destination) {
        const cents = parseMoney(amount.replace(/,/g, ''));
        const sourceNext = BigInt(calculateAccountSummary(account, finance.transactions, '1900-01').balance) - BigInt(cents);
        const destinationNext = BigInt(calculateAccountSummary(destination, finance.transactions, '1900-01').balance) + BigInt(cents);
        if ([sourceNext, destinationNext].some((value) => value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER))) throw new Error('Balance exceeds supported range.');
        after = Number(sourceNext); destinationAfter = Number(destinationNext);
      }
    }
  } catch { /* Incomplete inputs are validated on Save. */ }
  function save() {
    if (locked || pending.current || rejected) return;
    let cents: number;
    try {
      cents = parseMoney(amount.replace(/,/g, ''));
      if (external && !name.trim()) throw new Error('Enter the external source or destination name.');
      if (!account || account.archived) throw new Error('Choose an active account.');
      if (!external) {
        const draft = { type: 'TRANSFER' as const, accountId, destinationAccountId: destinationId, amount: cents, category: 'Transfer', ...dateTime, notes: notes.trim() || undefined };
        validateDraft(draft, account, finance.accounts.find((row) => row.id === destinationId));
        calculateFinanceSummary(finance.accounts, [...finance.transactions, { ...draft, id: 'preview', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], dateTime.transactionDate.slice(0, 7));
      }
      if (external && after === undefined) throw new Error('Balance exceeds the supported range.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the inputs.'); return; }
    pending.current = true;
    Alert.alert('Save transfer?', (external === 'increase' ? name.trim() + ' to ' + account.name : account.name + ' to ' + (external ? name.trim() : finance.accounts.find((row) => row.id === destinationId)?.name)) + '\n' + formatMoney(cents) + (external ? '\nExcluded from History, income, and expenses. An internal record is kept for balances and backups.' : '\nIncome and expense totals stay unchanged.'), [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Save', onPress: () => {
        setSaving(true);
        void (async () => {
          try {
            const id = submission.current ??= await finance.newSubmissionId();
            const now = new Date().toISOString();
            if (external) await finance.saveExternal({ id, type: 'EXTERNAL', accountId: account.id, category: 'External transfer', amount: cents, externalName: name.trim(), adjustmentDirection: external, ...dateTime, notes: notes.trim() || undefined, createdAt: now, updatedAt: now });
            else await finance.saveTransaction(id, { type: 'TRANSFER', accountId, destinationAccountId: destinationId, category: 'Transfer', amount: cents, ...dateTime, notes: notes.trim() || undefined }, false);
            submission.current = undefined;
            if (router.canGoBack()) router.back(); else router.replace('/');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not save. Draft kept.');
            pending.current = false; setSaving(false);
          }
          // On success, keep the form disabled throughout the exit transition.
        })();
      } },
    ], { cancelable: false });
  }
  const destination = finance.accounts.find((row) => row.id === destinationId);
  function endpoint(side: 'from' | 'to') {
    const isExternal = external === (side === 'from' ? 'increase' : 'decrease');
    const selected = side === 'from' ? finance.accounts.find((row) => row.id === accountId) : destination;
    return <View style={{ gap: 6 }}>
      <ThemedText type="smallBold">{side === 'from' ? 'From' : 'To'}</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={'Choose ' + side} disabled={locked} onPress={() => setPicker(side)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }}>
        <Ionicons name={isExternal ? 'person-outline' : 'wallet-outline'} size={20} color={theme.textSecondary} />
        <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{isExternal ? 'External' : selected?.name ?? 'Choose account'}</ThemedText>
        <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
      </Pressable>
      {isExternal ? <TextInput accessibilityLabel={side === 'from' ? 'External source name' : 'External destination name'} value={name} onChangeText={setName} editable={!locked} placeholder={side === 'from' ? 'External source name' : 'External destination name'} placeholderTextColor={theme.textSecondary} style={input} /> : null}
    </View>;
  }
  const input = { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, color: theme.text, fontSize: 12 };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen title="Transfer" tabScreen={false} headerLeading={<BackButton disabled={locked} onPress={() => { if (!pending.current) { if (router.canGoBack()) router.back(); else router.replace('/'); } }} />}>
      <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 10 }}>
      {endpoint('from')}
      {endpoint('to')}
      <ThemedText type="small" themeColor="textSecondary">{external ? 'Moves money ' + (external === 'increase' ? 'into' : 'out of') + ' your account. Excluded from History, income, and expenses; kept in balances and backups. Use Income or Expense for salary or purchases.' : 'Moves money between your accounts without changing income or expense totals.'}</ThemedText>
      <ThemedText type="small">Amount (PHP)</ThemedText>
      <MoneyField accessibilityLabel="Transfer amount" value={amount} editable={!locked} onValueChange={(value) => { setAmount(value); setRejected(false); setError(''); }} onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }} style={{ ...input, fontSize: 22 }} />
      <TransactionDateTime date={dateTime.transactionDate} time={dateTime.transactionTime} disabled={locked} onDateChange={(transactionDate) => setDateTime({ ...dateTime, transactionDate })} onTimeChange={(transactionTime) => setDateTime({ ...dateTime, transactionTime })} />
      <TextInput accessibilityLabel="Optional transfer note" value={notes} onChangeText={setNotes} editable={!locked} placeholder="Optional note" placeholderTextColor={theme.textSecondary} style={input} />
      {after !== undefined ? <View style={{ padding: 12, borderRadius: 12, backgroundColor: theme.infoSurface, gap: 4 }}>
        <ThemedText type="smallBold">After saving</ThemedText>
        <ThemedText type="small">{account?.name}: {formatMoney(after)}</ThemedText>
        {destinationAfter !== undefined ? <ThemedText type="small">{destination?.name}: {formatMoney(destinationAfter)}</ThemedText> : null}
      </View> : null}
      {after !== undefined && after < 0 ? <ThemedText type="small" accessibilityRole="alert" themeColor="warning">Warning: this account will have a negative balance.</ThemedText> : null}
      {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
      <ActionButton primary label={saving ? 'Saving...' : 'Save transfer'} disabled={locked || rejected} onPress={save} />
      <ActionButton label="Cancel" disabled={locked} onPress={() => { if (!pending.current) { if (router.canGoBack()) router.back(); else router.replace('/'); } }} />
      </View>
      <SelectionSheet visible={Boolean(picker)} title={picker === 'from' ? 'From' : 'To'} selected={external === (picker === 'from' ? 'increase' : 'decrease') ? 'external' : picker === 'from' ? accountId : destinationId} disabled={locked} options={[...finance.accounts.filter((row) => !row.archived).map((row) => ({ value: row.id, label: row.name })), { value: 'external', label: 'External (outside Kuwenta)' }]} onClose={() => setPicker(null)} onSelect={(value) => {
        setError('');
        if (value === 'external') { setExternal(picker === 'from' ? 'increase' : 'decrease'); }
        else if (picker === 'from') { setAccountId(value); if (external === 'increase') setExternal(null); }
        else { setDestinationId(value); if (external === 'decrease') setExternal(null); }
      }} />
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
