import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MoneyField } from './money-field';
import { FinanceScreen, ActionButton } from './ui';
import { parseMoney } from '../money';

export function CashSetup({ busy, onComplete }: { busy: boolean; onComplete: (cents: number) => Promise<void> }) {
  const theme = useTheme();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  async function save(zero = false) {
    if (pending.current || busy || (!zero && rejected)) return;
    pending.current = true;
    try {
      const cents = zero ? 0 : parseMoney(amount.replace(/,/g, ''), { allowZero: true });
      setSaving(true); setError('');
      await onComplete(cents);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save starting money.'); }
    finally { pending.current = false; setSaving(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FinanceScreen title="Set up your Cash account">
      <ThemedText>How much cash do you have right now?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">This is your starting balance, not income. You can add other accounts later.</ThemedText>
      <MoneyField accessibilityLabel="Starting cash in pesos" value={amount} autoFocus editable={!busy && !saving} placeholder="0" placeholderTextColor={theme.textSecondary}
        onValueChange={(value) => { setAmount(value); setRejected(false); setError(''); }}
        onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }}
        style={{ color: theme.text, fontSize: 28, padding: 16, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }} />
      {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
      <ActionButton primary label={saving ? 'Saving...' : 'Start tracking'} disabled={busy || saving || rejected} onPress={() => { void save(); }} />
      <ActionButton label="Start with zero" disabled={busy || saving} onPress={() => { void save(true); }} />
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
