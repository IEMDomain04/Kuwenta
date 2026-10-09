import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { ActionButton, FinanceScreen } from '../components/ui';
import { BackupExport } from '../components/backup-export';
import { BackupImportPreview } from '../components/backup-import-preview';
import { formatMoney, moneyInput, parseMoney } from '../money';
import { acceptsMoneyInput } from '../inputs';
import { calculateAccountSummary } from '../calculations';
import { useFinance } from '../provider';

export default function SettingsScreen() {
  const { account, transactions, month, busy, saveOpeningBalance } = useFinance();
  const theme = useTheme();
  const [input, setInput] = useState(moneyInput(account.openingBalance));
  const [message, setMessage] = useState('');
  const [inputRejected, setInputRejected] = useState(false);
  const [saving, setSaving] = useState(false);
  const confirming = useRef(false);
  useEffect(() => { setInput(moneyInput(account.openingBalance)); }, [account.openingBalance]);

  function review() {
    if (confirming.current || busy || saving || inputRejected) return;
    setMessage('');
    let amount: number;
    try {
      amount = parseMoney(input, { allowNegative: true, allowZero: true });
      calculateAccountSummary({ ...account, openingBalance: amount }, transactions, month);
      if (amount === account.openingBalance) { setMessage('Opening balance is unchanged.'); return; }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid opening balance.'); return; }
    Keyboard.dismiss();
    confirming.current = true;
    Alert.alert('Change opening balance?', `${formatMoney(account.openingBalance)} → ${formatMoney(amount)}\nThis changes Cash balance, but does not count as income.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => { confirming.current = false; } },
      { text: 'Confirm', onPress: () => {
        setSaving(true);
        void saveOpeningBalance(amount).then(() => setMessage('Opening balance saved.'))
          .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Could not save.'))
          .finally(() => { confirming.current = false; setSaving(false); });
      } },
    ], { cancelable: false });
  }
  return <FinanceScreen title="Settings">
    <ThemedText type="smallBold">Account: {account.name}</ThemedText>
    <ThemedText>Currency: PHP (Philippine peso)</ThemedText>
    <ThemedText>Transaction time: Philippine time (UTC+8)</ThemedText>
    <ThemedText type="smallBold">Opening balance</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">The money you started tracking with. This is separate from recorded income. Enter pesos without commas.</ThemedText>
    <TextInput accessibilityLabel="Cash opening balance in pesos" value={input} onChangeText={(value) => { if (!acceptsMoneyInput(value, true)) { setInputRejected(true); setMessage('Only digits, one decimal point, and an optional leading minus sign are allowed. Input was not accepted.'); return; } setInput(value); setInputRejected(false); setMessage(''); }}
      editable={!busy && !saving} keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={review} placeholder="0.00" placeholderTextColor={theme.textSecondary}
      style={{ color: theme.text, borderColor: theme.textSecondary, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 18 }} />
    <ActionButton label={input.startsWith('-') ? 'Make positive' : 'Make negative'} disabled={busy || saving} onPress={() => { setInput(input.startsWith('-') ? input.slice(1) : '-' + input); setInputRejected(false); setMessage(''); }} />
    <ActionButton label={saving ? 'Saving…' : 'Save opening balance'} disabled={busy || saving || account.archived} onPress={review} />
    {message ? <ThemedText accessibilityLiveRegion="polite">{message}</ThemedText> : null}
    <ThemedText type="small" themeColor="textSecondary">Your financial records are stored on this device.</ThemedText>
    <BackupExport disabled={saving} />
    <BackupImportPreview disabled={busy || saving} />
  </FinanceScreen>;
}
