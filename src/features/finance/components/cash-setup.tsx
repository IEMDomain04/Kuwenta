import { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MoneyField } from './money-field';
import { FinanceScreen, ActionButton } from './ui';
import { parseMoney, formatMoney } from '../money';

const titles = ['Welcome to Kuwenta', 'What should we call you?', 'Your currency', 'Starting Cash', 'Ready to start'];
export function CashSetup({ busy, onComplete }: { busy: boolean; onComplete: (cents: number, name: string) => Promise<void> }) {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cents, setCents] = useState(0);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const locked = busy || saving;
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pending.current || locked) return true;
      if (step > 0) { setStep(step - 1); setError(''); return true; }
      return false;
    });
    return () => listener.remove();
  }, [step, locked]);
  function next(zero = false) {
    if (locked || pending.current) return;
    try {
      if (step === 1 && (name.trim().length > 50 || /[\u0000-\u001f\u007f]/.test(name))) throw new Error('Use a name up to 50 characters.');
      if (step === 3) {
        if (rejected && !zero) return;
        setCents(zero ? 0 : parseMoney(amount.replace(/,/g, ''), { allowZero: true }));
        if (zero) { setAmount('0'); setRejected(false); }
      }
      Keyboard.dismiss(); setError(''); setStep(step + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your details.'); }
  }
  async function finish() {
    if (locked || pending.current) return;
    pending.current = true; setSaving(true); setError('');
    try { await onComplete(cents, name.trim()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not finish setup. Your details are kept.'); }
    finally { pending.current = false; setSaving(false); }
  }
  const inputStyle = { color: theme.text, padding: 14, borderWidth: 1, borderColor: theme.border, borderRadius: 12, fontSize: 14 };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FinanceScreen title={titles[step]} tabScreen={false} headerLeading={<View />}>
      <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">Step {step + 1} of {titles.length}</ThemedText>
      <View style={{ padding: 18, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 14 }}>
        <Ionicons accessible={false} name={step === 0 ? 'wallet-outline' : step === 1 ? 'person-outline' : step === 2 ? 'cash-outline' : step === 3 ? 'calculator-outline' : 'checkmark-circle-outline'} size={36} color={theme.accent} />
        {step === 0 && <>
          <ThemedText>Know where your money goes.</ThemedText>
          <ThemedText type="small">Track income and expenses, manage accounts, set category budgets, and save toward goals.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Your records stay on this device. No sign-up is needed.</ThemedText>
        </>}
        {step === 1 && <>
          <ThemedText type="small">Your name is optional and used for your Home greeting.</ThemedText>
          <TextInput accessibilityLabel="Your name (optional)" value={name} maxLength={50} autoFocus editable={!locked} onChangeText={(value) => { setName(value); setError(''); }} placeholder="Your name" placeholderTextColor={theme.textSecondary} autoCapitalize="words" style={inputStyle} />
        </>}
        {step === 2 && <>
          <ThemedText type="smallBold">Philippine Peso (PHP)</ThemedText>
          <ThemedText type="small">PHP is currently the only supported currency. All accounts and reports use pesos. Transaction dates and times follow Philippine time.</ThemedText>
        </>}
        {step === 3 && <>
          <ThemedText>How much cash do you have right now?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">This is an opening balance, not income. You can add other accounts later.</ThemedText>
          <MoneyField accessibilityLabel="Starting cash in pesos" value={amount} autoFocus editable={!locked} placeholder="0" placeholderTextColor={theme.textSecondary} style={{ ...inputStyle, fontSize: 28 }}
            onValueChange={(value) => { setAmount(value); setRejected(false); setError(''); }} onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }} />
        </>}
        {step === 4 && <>
          <ThemedText type="smallBold">{name.trim() ? 'Welcome, ' + name.trim() : 'Welcome'}!</ThemedText>
          <ThemedText type="small">Cash starts at {formatMoney(cents)} in PHP.</ThemedText>
          <ThemedText type="small">Tap + to record money. Quick Entry turns short phrases into drafts for you to review before saving.</ThemedText>
          <ThemedText type="small">Home shows your balances and monthly reports. Transactions holds your history. Settings has account management and encrypted backups.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Export a password-protected backup to protect your records before uninstalling or resetting. Your optional name stays local and is not included in financial backups; restoring a backup clears it.</ThemedText>
        </>}
      </View>
      {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
      <ActionButton primary label={saving ? 'Saving...' : step === 4 ? 'Start tracking' : 'Continue'} disabled={locked || step === 3 && rejected} onPress={() => { if (step === 4) void finish(); else next(); }} />
      {step === 0 && <ActionButton label="Skip introduction" disabled={locked} onPress={() => setStep(1)} />}
      {step === 3 && <ActionButton label="Start with zero" disabled={locked} onPress={() => next(true)} />}
      {step > 0 && <ActionButton label="Back" disabled={locked} onPress={() => { Keyboard.dismiss(); setStep(step - 1); setError(''); }} />}
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
