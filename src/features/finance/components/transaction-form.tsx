import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, type Transaction, type TransactionDraft, type ManualTransactionType } from '../types';
import { philippineDateTime, isValidDate, isValidTime } from '../dates';
import { moneyInput, parseMoney } from '../money';
import { formatEditableMoney } from '../inputs';
import { MoneyField } from './money-field';
import { TransactionDateTime } from './transaction-date-time';
import { ActionButton } from './ui';

type Props = { original?: Transaction; initialType?: ManualTransactionType; disabled: boolean; error: string; onSubmit: (draft: TransactionDraft) => void; onCancel: () => void };
type Field = 'amount' | 'date' | 'time';
export function TransactionForm({ original, initialType = 'EXPENSE', disabled, error, onSubmit, onCancel }: Props) {
  const theme = useTheme();
  const [defaults] = useState(() => philippineDateTime());
  const [type, setType] = useState<ManualTransactionType>(original?.type === 'INCOME' ? 'INCOME' : original ? 'EXPENSE' : initialType);
  const [amount, setAmount] = useState(original ? formatEditableMoney(moneyInput(original.amount))! : '');
  const [category, setCategory] = useState(original?.category ?? CATEGORIES[initialType][0]);
  const [date, setDate] = useState(original?.transactionDate ?? defaults.transactionDate);
  const [time, setTime] = useState(original?.transactionTime ?? defaults.transactionTime);
  const [notes, setNotes] = useState(original?.notes ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const notesRef = useRef<TextInput>(null);
  const inputStyle = { color: theme.text, borderColor: theme.textSecondary, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 };
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
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
    <ThemedText>Account: Cash · PHP</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(['EXPENSE', 'INCOME'] as const).map((value) => <ActionButton key={value} selected={type === value}
        label={value === 'INCOME' ? 'Income' : 'Expense'} disabled={disabled}
        onPress={() => { if (type !== value) { setType(value); setCategory(CATEGORIES[value][0]); } }} />)}
    </View>
    <ThemedText>Amount in pesos</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Positive pesos, up to two decimal places. Example: 120.50.</ThemedText>
    <MoneyField accessibilityLabel="Amount in pesos" value={amount} onValueChange={(value) => { setAmount(value); setErrors((current) => ({ ...current, amount: undefined })); }} onRejected={() => setErrors((current) => ({ ...current, amount: 'Use digits and up to two decimal places. Input was not accepted.' }))} editable={!disabled}
      keyboardType="decimal-pad" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => notesRef.current?.focus()}
      placeholder="0.00" placeholderTextColor={theme.textSecondary} style={[inputStyle, { fontSize: 28, fontWeight: '600', fontVariant: ['tabular-nums'] }]} />
    {errors.amount ? <ThemedText accessibilityRole="alert">{errors.amount}</ThemedText> : null}
    <ThemedText>Category</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {CATEGORIES[type].map((value) => <ActionButton compact key={value} selected={category === value} label={value}
        disabled={disabled} onPress={() => setCategory(value)} />)}
    </View>
    <TransactionDateTime date={date} time={time} disabled={disabled}
      onDateChange={(value) => { setDate(value); setErrors((current) => ({ ...current, date: undefined })); }}
      onTimeChange={(value) => { setTime(value); setErrors((current) => ({ ...current, time: undefined })); }} />
    {errors.date ? <ThemedText accessibilityRole="alert">{errors.date}</ThemedText> : null}
    {errors.time ? <ThemedText accessibilityRole="alert">{errors.time}</ThemedText> : null}
    <ThemedText>Notes (optional)</ThemedText>
    <TextInput ref={notesRef} accessibilityLabel="Transaction notes" value={notes} onChangeText={setNotes} editable={!disabled} multiline style={inputStyle} />
    {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
    </ScrollView>
    <View style={{ gap: 8 }}>
    <ActionButton primary label={disabled ? 'Please wait…' : original ? 'Review changes' : 'Save'} disabled={disabled} onPress={submit} />
    <ActionButton label="Cancel" disabled={disabled} onPress={onCancel} />
    </View>
  </View>;
}
