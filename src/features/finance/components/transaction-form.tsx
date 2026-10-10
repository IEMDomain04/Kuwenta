import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { CategoryIcon, categoryVisual } from './category-visual';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, type Transaction, type TransactionDraft, type ManualTransactionType } from '../types';
import { philippineDateTime, isValidDate, isValidTime } from '../dates';
import { moneyInput, parseMoney } from '../money';
import { formatEditableMoney } from '../inputs';
import { MoneyField } from './money-field';
import { TransactionDateTime } from './transaction-date-time';
import { ActionButton } from './ui';

type Props = { original?: Transaction; initialType?: ManualTransactionType; disabled: boolean; error: string; onSubmit: (draft: TransactionDraft) => void; onCancel: () => void; onTypeChange: (type: ManualTransactionType) => void };
type Field = 'amount' | 'date' | 'time';
export function TransactionForm({ original, initialType = 'EXPENSE', disabled, error, onSubmit, onCancel, onTypeChange }: Props) {
  const theme = useTheme();
  const { height, fontScale } = useWindowDimensions();
  const [amountWidth, setAmountWidth] = useState(0);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [defaults] = useState(() => philippineDateTime());
  const [type, setType] = useState<ManualTransactionType>(original?.type === 'INCOME' ? 'INCOME' : original ? 'EXPENSE' : initialType);
  const [amount, setAmount] = useState(original ? formatEditableMoney(moneyInput(original.amount))! : '');
  const amountFontSize = amountWidth > 0 ? Math.max(20, Math.min(36, Math.floor(amountWidth / ((Math.max(amount.length, 1) + 1) * 0.65 * fontScale)))) : 36;
  const [category, setCategory] = useState(original?.category ?? CATEGORIES[initialType][0]);
  const [date, setDate] = useState(original?.transactionDate ?? defaults.transactionDate);
  const [time, setTime] = useState(original?.transactionTime ?? defaults.transactionTime);
  const [notes, setNotes] = useState(original?.notes ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const notesRef = useRef<TextInput>(null);
  const inputStyle = { color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 };
  function submit() {
    const issues = { ...errors };
    let cents = 0;
    try { cents = parseMoney(amount.replace(/,/g, '')); } catch (cause) { issues.amount = cause instanceof Error ? cause.message : 'Invalid amount.'; }
    if (!isValidDate(date)) issues.date = 'Enter a real date as YYYY-MM-DD (1900-9999).';
    if (!isValidTime(time)) issues.time = 'Enter a valid 24-hour time as HH:mm:ss.';
    setErrors(issues);
    if (Object.values(issues).some(Boolean)) return;
    onSubmit({ type, amount: cents, accountId: 'cash', category, transactionDate: date, transactionTime: time, notes: notes.trim() || undefined });
  }
  return <View style={{ flex: 1, gap: 12 }}>
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ gap: 12, padding: 14, paddingBottom: 16, backgroundColor: theme.backgroundElement, borderRadius: 20 }}>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(['EXPENSE', 'INCOME'] as const).map((value) => <ActionButton key={value} selected={type === value}
        compact label={value === 'INCOME' ? 'Income' : 'Expense'} disabled={disabled}
        onPress={() => { if (type !== value) { setType(value); onTypeChange(value); setCategory(CATEGORIES[value][0]); } }} />)}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: type === 'INCOME' ? theme.incomeSurface : theme.expenseSurface, padding: 16, minHeight: 132 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Category: ' + category + '. Change category.'} accessibilityState={{ disabled }} disabled={disabled}
        onPress={() => { Keyboard.dismiss(); setCategoryOpen(true); }} style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: categoryVisual(category, type === 'INCOME').color + '20', opacity: pressed || disabled ? 0.5 : 1 })}>
        <Ionicons name={categoryVisual(category, type === 'INCOME').icon} size={44} color={categoryVisual(category, type === 'INCOME').color} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View onLayout={(event) => setAmountWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 52 }}>
          <ThemedText style={{ fontSize: amountFontSize, lineHeight: Math.ceil(amountFontSize * 1.3), fontWeight: '700' }}>₱</ThemedText>
          <MoneyField accessibilityLabel="Amount in pesos" value={amount} onValueChange={(value) => { setAmount(value); setErrors((current) => ({ ...current, amount: undefined })); }} onRejected={() => setErrors((current) => ({ ...current, amount: 'Use digits and up to two decimal places. Input was not accepted.' }))} editable={!disabled}
            keyboardType="decimal-pad" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => notesRef.current?.focus()}
            placeholder="0" placeholderTextColor={theme.textSecondary} style={{ flex: 1, minWidth: 0, color: theme.text, paddingVertical: 4, paddingHorizontal: 0, fontSize: amountFontSize, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] }} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={'Category: ' + category + '. Change category.'} accessibilityState={{ disabled }} disabled={disabled}
          onPress={() => { Keyboard.dismiss(); setCategoryOpen(true); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <ThemedText numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, fontSize: 16, lineHeight: 22, textAlign: 'right' }}>{category}</ThemedText>
          <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>
    </View>
    {errors.amount ? <ThemedText accessibilityRole="alert">{errors.amount}</ThemedText> : null}
    <TransactionDateTime date={date} time={time} disabled={disabled}
      onDateChange={(value) => { setDate(value); setErrors((current) => ({ ...current, date: undefined })); }}
      onTimeChange={(value) => { setTime(value); setErrors((current) => ({ ...current, time: undefined })); }} />
    {errors.date ? <ThemedText accessibilityRole="alert">{errors.date}</ThemedText> : null}
    {errors.time ? <ThemedText accessibilityRole="alert">{errors.time}</ThemedText> : null}
    <ThemedText type="smallBold">Account</ThemedText>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }}><Ionicons name="wallet-outline" size={20} color={theme.textSecondary} /><ThemedText>Cash · PHP</ThemedText></View>
    <ThemedText type="smallBold">Notes (optional)</ThemedText>
    <TextInput ref={notesRef} accessibilityLabel="Transaction notes" value={notes} onChangeText={setNotes} editable={!disabled} multiline placeholder="Add a note…" placeholderTextColor={theme.textSecondary} style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]} />
    {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
    </ScrollView>
    <View style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={original ? 'Review changes' : 'Save'} accessibilityState={{ disabled }} disabled={disabled} onPress={submit}>
      <LinearGradient colors={['#087F8C', '#258B79']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ padding: 16, minHeight: 50, borderRadius: 14, alignItems: 'center', opacity: disabled ? 0.5 : 1 }}>
        <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>{disabled ? 'Please wait…' : original ? 'Review changes' : 'Save'}</ThemedText>
      </LinearGradient>
    </Pressable>
    <ActionButton label="Cancel" disabled={disabled} onPress={onCancel} />
    </View>
    <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close category picker" onPress={() => setCategoryOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: height * 0.8, backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View accessibilityViewIsModal style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText type="smallBold" accessibilityRole="header">Choose category</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close category picker" onPress={() => setCategoryOpen(false)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={24} color={theme.text} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.55 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORIES[type].map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: value === category, disabled }} disabled={disabled}
                  onPress={() => { setCategory(value); setCategoryOpen(false); }} style={({ pressed }) => ({ width: '31%', minHeight: 80, padding: 8, borderRadius: 12, borderWidth: 1.5, borderColor: value === category ? theme.accent : theme.border, backgroundColor: value === category ? theme.backgroundSelected : theme.backgroundElement, alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed || disabled ? 0.5 : 1 })}>
                  <CategoryIcon category={value} income={type === 'INCOME'} />
                  <ThemedText type="small" numberOfLines={1} ellipsizeMode="tail" style={{ width: '100%', fontSize: 12, lineHeight: 17, textAlign: 'center' }}>{value}</ThemedText>
                  {value === category && <Ionicons name="checkmark-circle" size={14} color={theme.accent} />}
                </Pressable>)}
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
