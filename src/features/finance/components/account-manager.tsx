import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, Modal, Pressable, ScrollView, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { calculateAccountSummary } from '../calculations';
import { formatEditableMoney } from '../inputs';
import { formatMoney, moneyInput, parseMoney } from '../money';
import { validateAccount } from '../validation';
import type { Account } from '../types';
import { ActionButton } from './ui';
import { MoneyField } from './money-field';

export function AccountManager({ accountId, onClose, initialPurpose = 'spending', initialCorrectOpening = false }: { accountId?: string; onClose?: () => void; initialPurpose?: Account['purpose']; initialCorrectOpening?: boolean } = {}) {
  const { accounts, transactions, month, busy, saveAccount, newSubmissionId } = useFinance();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [purposeOpen, setPurposeOpen] = useState(false);
  const initial = accountId ? accounts.find((account) => account.id === accountId) : undefined;
  const [editor, setEditor] = useState<Account | null>(() => onClose
    ? initial ? initial.archived ? null : { ...initial } : { id: '', name: '', currency: 'PHP', openingBalance: 0, purpose: initialPurpose, includedInAvailable: initialPurpose === 'spending', archived: false }
    : null);
  const [opening, setOpening] = useState(initial ? formatEditableMoney(moneyInput(initial.openingBalance), true)! : onClose ? '0' : '');
  const [correctOpening, setCorrectOpening] = useState(initialCorrectOpening);
  const [rejected, setRejected] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const newId = useRef<string | undefined>(undefined);
  const locked = busy || working;
  useEffect(() => {
    if (!onClose) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => pending.current || busy || working);
    return () => subscription.remove();
  }, [onClose, busy, working]);
  function edit(account?: Account) {
    setPurposeOpen(false);
    newId.current = undefined;
    setCorrectOpening(false);
    setEditor(account ? { ...account } : { id: '', name: '', currency: 'PHP', openingBalance: 0, purpose: initialPurpose, includedInAvailable: initialPurpose === 'spending', archived: false });
    setOpening(account ? formatEditableMoney(moneyInput(account.openingBalance), true)! : '0');
    setRejected(false); setError('');
  }
  async function commit(account: Account, creating: boolean) {
    setWorking(true);
    try {
      const id = creating ? (newId.current ??= await newSubmissionId()) : account.id;
      await saveAccount({ ...account, id }, creating);
      setEditor(null); newId.current = undefined; setError(''); onClose?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the account.'); }
    finally { pending.current = false; setWorking(false); }
  }
  function review() {
    if (!editor || locked || pending.current || rejected) return;
    let draft: Account;
    try {
      draft = { ...editor, id: editor.id || 'new-account', name: editor.name.trim(), openingBalance: editor.id && !correctOpening ? editor.openingBalance : parseMoney(opening.replace(/,/g, ''), { allowZero: true, allowNegative: true }) };
      validateAccount(draft);
      calculateAccountSummary(draft, transactions, month);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid account.'); return; }
    Keyboard.dismiss(); pending.current = true;
    if (!editor.id) { void commit(draft, true); return; }
    Alert.alert('Save account changes?', draft.name + (correctOpening ? '\nCorrect original opening balance: ' + formatMoney(editor.openingBalance) + ' to ' + formatMoney(draft.openingBalance) + '\nThis changes the historical starting balance and current balance, without counting as income.' : '\nAccount settings will be updated. The balance stays unchanged.'), [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Confirm', onPress: () => { void commit(draft, false); } },
    ], { cancelable: false });
  }
  function archive(account: Account) {
    if (locked || pending.current) return;
    pending.current = true;
    Alert.alert(account.archived ? 'Unarchive account?' : 'Archive account?',
      account.archived ? 'This makes ' + account.name + ' available for new transactions again.' : 'Existing records and the balance are kept. New transactions and edits are blocked until you unarchive this account.',
      [{ text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
        { text: account.archived ? 'Unarchive' : 'Archive', onPress: () => { void commit({ ...account, archived: !account.archived }, false); } }], { cancelable: false });
  }
  const savedAccount = accounts.find((account) => account.id === editor?.id);
  let previewBalance: number | undefined;
  if (editor && !editor.id) {
    try { previewBalance = parseMoney(opening.replace(/,/g, '') || '0', { allowZero: true, allowNegative: true }); }
    catch { /* An incomplete or invalid draft has no displayable balance. */ }
  }
  const previewColor = editor?.purpose === 'savings' ? theme.income : theme.accent;
  const inputStyle = { color: theme.text, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, fontSize: 12 };
  return <View style={{ gap: 12 }}>
    <ThemedText type="smallBold" accessibilityRole="header">Accounts · PHP</ThemedText>
    {editor ? <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 10 }}>
      <ThemedText type="smallBold">{editor.id ? 'Edit account' : 'Add account'}</ThemedText>
      {!editor.id ? <View accessibilityLabel="New account preview" style={{ padding: 16, minHeight: 150, borderRadius: 20, backgroundColor: previewColor, gap: 12, boxShadow: '0 3px 8px rgba(20, 36, 67, 0.08)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={editor.purpose === 'savings' ? 'shield-checkmark-outline' : 'wallet-outline'} size={20} color="#FFFFFF" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 12, lineHeight: 17, color: '#FFFFFF' }}>{editor.name.trim() || 'New account'}</ThemedText>
            <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: '#FFFFFF' }}>{editor.purpose === 'savings' ? 'Savings / PHP' : 'Spending / PHP'}</ThemedText>
          </View>
        </View>
        <View style={{ marginTop: 'auto', gap: 3 }}>
          <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: '#FFFFFF' }}>STARTING BALANCE</ThemedText>
          <ThemedText style={{ fontSize: 18, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'], color: '#FFFFFF' }}>{previewBalance === undefined ? '—' : formatMoney(previewBalance)}</ThemedText>
          {previewBalance !== undefined && previewBalance < 0 ? <ThemedText type="small" style={{ fontSize: 10, color: '#FFFFFF' }}>Negative starting balance</ThemedText> : null}
        </View>
      </View> : null}
      {savedAccount && <ThemedText type="smallBold">Current balance: {formatMoney(calculateAccountSummary(savedAccount, transactions, month).balance)}</ThemedText>}
      <ThemedText type="small">Account name</ThemedText>
      <TextInput accessibilityLabel="Account name" value={editor.name} onChangeText={(name) => setEditor({ ...editor, name })} editable={!locked} placeholder="Bank, GCash, Savings…" placeholderTextColor={theme.textSecondary} style={inputStyle} />
      <ThemedText type="small">Purpose</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="Select account purpose" accessibilityState={{ disabled: locked, expanded: purposeOpen }} disabled={locked} onPress={() => { Keyboard.dismiss(); setPurposeOpen(true); }} style={{ minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={editor.purpose === 'savings' ? 'shield-checkmark-outline' : 'wallet-outline'} size={18} color={theme.accent} />
        <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{editor.purpose === 'spending' ? 'Spending' : 'Savings'}</ThemedText>
        <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
      </Pressable>
      <ThemedText type="small">{editor.id ? 'Opening balance' : 'Starting balance'}</ThemedText>
      {editor.id && <><ThemedText type="small">{formatMoney(editor.openingBalance)}</ThemedText><ThemedText type="small" themeColor="textSecondary">The original starting amount, separate from your current balance.</ThemedText><ActionButton compact label={correctOpening ? "Keep original opening balance" : "Correct opening balance"} disabled={locked} onPress={() => { setCorrectOpening(!correctOpening); setRejected(false); setError(""); }} /></>}
      {(!editor.id || correctOpening) && <>
      <MoneyField signed accessibilityLabel="Account opening balance in pesos" value={opening} onValueChange={(value) => { setOpening(value); setRejected(false); setError(''); }}
        onRejected={() => { setRejected(true); setError('Use digits, up to two decimal places, and an optional minus sign.'); }} editable={!locked} placeholder="0" placeholderTextColor={theme.textSecondary} style={inputStyle} />
      <ThemedText type="small" themeColor="textSecondary">A starting balance adjustment, separate from income.</ThemedText>
      </>}
      {editor.id ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ThemedText type="small" style={{ flex: 1 }}>Include in Available Money</ThemedText>
        <Switch accessibilityLabel="Include account in Available Money" value={editor.includedInAvailable} disabled={locked} onValueChange={(includedInAvailable) => setEditor({ ...editor, includedInAvailable })} trackColor={{ true: theme.accent }} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">Included balances contribute to Available Money in Accounts.</ThemedText>
      </> : null}
      <ActionButton primary label={working ? 'Saving…' : editor.id ? 'Review changes' : 'Save account'} disabled={locked || rejected} onPress={review} />
      <ActionButton label="Cancel" disabled={locked} onPress={() => { if (!pending.current) { setEditor(null); setError(''); newId.current = undefined; onClose?.(); } }} />
    </View> : !onClose ? <ActionButton label="Add account" primary disabled={locked} onPress={() => edit()} /> : null}
    {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
    {(onClose ? editor ? [] : accounts.filter((account) => account.id === accountId) : accounts).map((account) => {
      const summary = calculateAccountSummary(account, transactions, month);
      const count = transactions.filter((row) => (row.accountId === account.id || row.destinationAccountId === account.id)).length;
      return <View key={account.id} style={{ backgroundColor: theme.backgroundElement, borderRadius: 18, padding: 14, gap: 8 }}>
        <ThemedText type="smallBold">{account.name}{account.archived ? ' · Archived' : ''}</ThemedText>
        <ThemedText style={{ fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatMoney(summary.balance)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{account.purpose === 'spending' ? 'Spending' : 'Savings'} · {count} {count === 1 ? 'transaction' : 'transactions'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Opening: {formatMoney(account.openingBalance)} · {account.includedInAvailable ? 'Included in' : 'Excluded from'} Available Money</ThemedText>
        {summary.hasNegativeBalance && <ThemedText accessibilityRole="alert">Warning: this account balance is negative.</ThemedText>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {!account.archived && <ActionButton compact label="Edit" disabled={locked || Boolean(editor)} onPress={() => edit(account)} />}
          <ActionButton compact label={account.archived ? 'Unarchive' : 'Archive'} disabled={locked || Boolean(editor)} onPress={() => archive(account)} />
        </View>

      </View>;
    })}
    {onClose && !editor && <ActionButton label="Back" disabled={locked} onPress={() => { if (!pending.current) onClose(); }} />}
    <Modal visible={purposeOpen && Boolean(editor)} transparent animationType="fade" onRequestClose={() => setPurposeOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.3)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close purpose selection" onPress={() => setPurposeOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: height * 0.8, backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View accessibilityViewIsModal>
            <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText type="smallBold" accessibilityRole="header">Account purpose</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close purpose selection" onPress={() => setPurposeOpen(false)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={20} color={theme.text} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.55 }} contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}>
              {(['spending', 'savings'] as const).map((purpose) => <Pressable key={purpose} accessibilityRole="button" accessibilityState={{ selected: editor?.purpose === purpose, disabled: locked }} disabled={locked} onPress={() => {
                if (editor && editor.purpose !== purpose) setEditor({ ...editor, purpose, includedInAvailable: purpose === 'spending' });
                setPurposeOpen(false);
              }} style={{ minHeight: 64, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: editor?.purpose === purpose ? theme.accent : theme.border, backgroundColor: editor?.purpose === purpose ? theme.incomeSurface : theme.backgroundElement, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name={purpose === 'spending' ? 'wallet-outline' : 'shield-checkmark-outline'} size={22} color={theme.accent} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 12, lineHeight: 17 }}>{purpose === 'spending' ? 'Spending' : 'Savings'}</ThemedText>
                  <ThemedText type="small" style={{ fontSize: 11, lineHeight: 16 }} themeColor="textSecondary">{purpose === 'spending' ? 'Money for everyday expenses.' : 'Money set aside for later.'}</ThemedText>
                </View>
                {editor?.purpose === purpose ? <Ionicons name="checkmark-circle" size={20} color={theme.accent} /> : null}
              </Pressable>)}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}