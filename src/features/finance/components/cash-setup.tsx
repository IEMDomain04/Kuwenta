import { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MoneyField } from './money-field';
import { ActionButton } from './ui';
import { parseMoney, formatMoney } from '../money';

const titles = ['Welcome to Kuwenta', 'What should we call you?', 'See where your money goes', 'Make room for your plans', 'Your starting money', 'You are ready!'];
const mascots = [
  require('../../../../assets/images/mascot/friendly.png'),
  require('../../../../assets/images/mascot/friendly.png'),
  require('../../../../assets/images/mascot/thinking.png'),
  require('../../../../assets/images/mascot/encouraging.png'),
  require('../../../../assets/images/mascot/thinking.png'),
  require('../../../../assets/images/mascot/celebrating.png'),
];
export function CashSetup({ busy, onComplete }: { busy: boolean; onComplete: (cents: number, name: string, accountName: string) => Promise<void> }) {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [skipIntro, setSkipIntro] = useState(false);
  const [accountName, setAccountName] = useState('Cash');
  const [amount, setAmount] = useState('');
  const [cents, setCents] = useState(0);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const locked = busy || saving;
  function back() {
    if (locked || pending.current) return;
    Keyboard.dismiss(); setStep(step === 4 && skipIntro ? 1 : Math.max(0, step - 1)); setError('');
  }
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pending.current || locked) return true;
      if (step > 0) { Keyboard.dismiss(); setStep(step === 4 && skipIntro ? 1 : step - 1); setError(''); return true; }
      return false;
    });
    return () => listener.remove();
  }, [step, locked]);
  function next() {
    if (locked || pending.current) return;
    try {
      if (step === 1 && !name.trim()) throw new Error('Please enter your name.');
      if (step === 1 && (name.trim().length > 50 || /[\u0000-\u001f\u007f]/.test(name))) throw new Error('Use a name up to 50 characters.');
      if (step === 4) {
        if (!accountName.trim() || accountName.trim().length > 50 || /[\u0000-\u001f\u007f]/.test(accountName)) throw new Error('Enter an account name up to 50 characters.');
        if (rejected) return;
        setCents(parseMoney(amount.replace(/,/g, '') || '0', { allowZero: true }));
      }
      Keyboard.dismiss(); setError(''); setStep(step === 1 && skipIntro ? 4 : step + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your details.'); }
  }
  async function finish() {
    if (locked || pending.current) return;
    if (!name.trim()) { setError('Please enter your name.'); setStep(1); return; }
    pending.current = true; setSaving(true); setError('');
    try { await onComplete(cents, name.trim(), accountName.trim()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not finish setup. Your details are kept.'); }
    finally { pending.current = false; setSaving(false); }
  }
  const inputStyle = { color: theme.text, backgroundColor: theme.backgroundElement, padding: 14, borderWidth: 1, borderColor: theme.border, borderRadius: 16, fontSize: 12 };
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingTop: 8 }}>
        <View accessibilityRole="progressbar" accessibilityLabel="Onboarding progress" accessibilityValue={{ min: 1, max: titles.length, now: step + 1, text: 'Step ' + (step + 1) + ' of ' + titles.length }} style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {titles.map((title, index) => <View key={title} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: index <= step ? theme.accent : theme.border }} />)}
        </View>
        {step < 4 && !skipIntro ? <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction and go to account setup" disabled={locked} onPress={() => { Keyboard.dismiss(); setError(''); setSkipIntro(true); setStep(1); }} style={{ minHeight: 44, justifyContent: 'center' }}><ThemedText type="small" themeColor="textSecondary">Skip intro</ThemedText></Pressable> : null}
      </View>
      <ScrollView key={step} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        <Image source={mascots[step]} contentFit="contain" accessible={false} style={{ width: '100%', height: step === 4 ? 120 : 190 }} />
        <ThemedText accessibilityRole="header" style={{ textAlign: 'center', fontSize: 23, lineHeight: 30, fontWeight: '600' }}>{titles[step]}</ThemedText>
        {step === 0 ? <>
          <ThemedText type="small" style={{ textAlign: 'center' }}>Your everyday money, made clearer.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Track spending, manage accounts, and work toward your goals. No sign-up needed.</ThemedText>
        </> : null}
        {step === 1 ? <>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Choose the name you want to see in your Home greeting.</ThemedText>
          <TextInput accessibilityLabel="Your name" value={name} maxLength={50} editable={!locked} onChangeText={(value) => { setName(value); setError(''); }} placeholder="Your name" placeholderTextColor={theme.textSecondary} autoCapitalize="words" returnKeyType="next" onSubmitEditing={next} style={inputStyle} />
        </> : null}
        {step === 2 ? <>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Use the + button to record money activity.</ThemedText>
          {[
            { icon: 'swap-vertical-outline', title: 'Income and expenses', text: 'Record money received and money spent.' },
            { icon: 'swap-horizontal-outline', title: 'Transfers', text: 'Move money between accounts without counting it as income.' },
            { icon: 'create-outline', title: 'Quick Entry', text: 'Type a transaction, review it, then save.' },
          ].map((item) => <View key={item.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name={item.icon as 'create-outline' | 'swap-vertical-outline' | 'swap-horizontal-outline'} size={22} color={theme.accent} /><View style={{ flex: 1, gap: 2 }}><ThemedText type="smallBold">{item.title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{item.text}</ThemedText></View></View>)}
        </> : null}
        {step === 3 ? <>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Find budgets, savings, and goals in Plans.</ThemedText>
          <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.backgroundElement, gap: 10 }}>
            <ThemedText type="small">Budgets help you follow monthly spending limits.</ThemedText>
            <ThemedText type="small">Savings accounts and goals show your progress.</ThemedText>
          </View>
        </> : null}
        {step === 4 ? <>
          <ThemedText type="smallBold">Currency: Philippine Peso (PHP)</ThemedText>
          <ThemedText type="smallBold">First account name</ThemedText>
          <TextInput accessibilityLabel="First account name" value={accountName} maxLength={50} editable={!locked} onChangeText={(value) => { setAccountName(value); setError(''); }} placeholder="Cash" placeholderTextColor={theme.textSecondary} autoCapitalize="words" style={inputStyle} />
          <ThemedText type="smallBold">Starting balance</ThemedText>
          <MoneyField accessibilityLabel="Starting balance in pesos" value={amount} editable={!locked} placeholder="0" placeholderTextColor={theme.textSecondary} style={{ ...inputStyle, fontSize: 22 }}
            onValueChange={(value) => { setAmount(value); setRejected(false); setError(''); }} onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }} />
          <ThemedText type="small" themeColor="textSecondary">Your current money, not income. Leave blank to start with zero.</ThemedText>
        </> : null}
        {step === 5 ? <>
          <ThemedText type="small" style={{ textAlign: 'center' }}>{name.trim() ? 'Welcome, ' + name.trim() + '!' : 'Welcome!'} {accountName.trim()} starts with {formatMoney(cents)}.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>Your records stay on this device. Export a backup from Settings to keep a safe copy.</ThemedText>
        </> : null}
        {error ? <ThemedText accessibilityRole="alert" type="small" style={{ color: theme.error, backgroundColor: theme.errorSurface, padding: 12, borderRadius: 12 }}>{error}</ThemedText> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 12, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        {step > 0 ? <View style={{ flex: 1 }}><ActionButton label="Back" disabled={locked} onPress={back} /></View> : null}
        <View style={{ flex: 2 }}><ActionButton primary label={saving ? 'Saving...' : step === 5 ? 'Start tracking' : 'Next'} disabled={locked || step === 4 && rejected} onPress={() => { if (step === 5) void finish(); else next(); }} /></View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
