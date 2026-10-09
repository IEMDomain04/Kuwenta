import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, type Transaction, type TransactionDraft, type ManualTransactionType } from '../types';
import { philippineDateTime, isValidDate, isValidTime } from '../dates';
import { moneyInput, parseMoney } from '../money';
import { acceptsMoneyInput, dateInput, timeInput } from '../inputs';
import { ActionButton } from './ui';

type Props = { original?: Transaction; initialType?: ManualTransactionType; disabled: boolean; error: string; onSubmit: (draft: TransactionDraft) => void; onCancel: () => void };
type Field = 'amount' | 'date' | 'time';
export function TransactionForm({ original, initialType = 'EXPENSE', disabled, error, onSubmit, onCancel }: Props) {
  const theme = useTheme();
  const [defaults] = useState(() => philippineDateTime());
  const [type, setType] = useState<ManualTransactionType>(original?.type === 'INCOME' ? 'INCOME' : original ? 'EXPENSE' : initialType);
  const [amount, setAmount] = useState(original ? moneyInput(original.amount) : '');
  const [category, setCategory] = useState(original?.category ?? CATEGORIES[initialType][0]);
  const [date, setDate] = useState(original?.transactionDate ?? defaults.transactionDate);
  const [time, setTime] = useState(original?.transactionTime ?? defaults.transactionTime);
  const [notes, setNotes] = useState(original?.notes ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const dateRef = useRef<TextInput>(null);
  const timeRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const inputStyle = { color: theme.text, borderColor: theme.textSecondary, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 };
  function change(field: Field, value: string) {
    const accepted = field === 'amount' ? (acceptsMoneyInput(value) ? value : null) : field === 'date' ? dateInput(value) : timeInput(value);
    if (accepted === null) {
      setErrors((current) => ({ ...current, [field]: field === 'amount' ? 'Only digits, one decimal point, and two decimal places are allowed. Input was not accepted.' : 'Only digits and the displayed separators are allowed. Input was not accepted.' }));
      return;
    }
    if (field === 'amount') setAmount(accepted);
    else if (field === 'date') setDate(accepted);
    else setTime(accepted);
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  function submit() {
    const issues = { ...errors };
    let cents = 0;
    try { cents = parseMoney(amount); } catch (cause) { issues.amount = cause instanceof Error ? cause.message : 'Invalid amount.'; }
    if (!isValidDate(date)) issues.date = 'Enter a real date as YYYY-MM-DD (1900-9999).';
    if (!isValidTime(time)) issues.time = 'Enter a valid 24-hour time as HH:mm:ss.';
    setErrors(issues);
    if (Object.values(issues).some(Boolean)) return;
    onSubmit({ type, amount: cents, accountId: 'cash', category, transactionDate: date, transactionTime: time, notes: notes.trim() || undefined });
  }
  return <>
    <ThemedText>Account: Cash · PHP</ThemedText>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {(['EXPENSE', 'INCOME'] as const).map((value) => <ActionButton key={value} selected={type === value}
        label={value === 'INCOME' ? 'Income' : 'Expense'} disabled={disabled}
        onPress={() => { if (type !== value) { setType(value); setCategory(CATEGORIES[value][0]); } }} />)}
    </View>
    <ThemedText>Amount in pesos</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Example: 120.50. No commas or minus sign.</ThemedText>
    <TextInput accessibilityLabel="Amount in pesos" value={amount} onChangeText={(value) => change('amount', value)} editable={!disabled}
      keyboardType="decimal-pad" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => dateRef.current?.focus()}
      placeholder="120.00" placeholderTextColor={theme.textSecondary} style={inputStyle} />
    {errors.amount ? <ThemedText accessibilityRole="alert">{errors.amount}</ThemedText> : null}
    <ThemedText>Category</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {CATEGORIES[type].map((value) => <ActionButton key={value} selected={category === value} label={value}
        disabled={disabled} onPress={() => setCategory(value)} />)}
    </View>
    <ThemedText>Date (YYYY-MM-DD) · Philippine time</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Enter eight digits; separators are added automatically.</ThemedText>
    <TextInput ref={dateRef} accessibilityLabel="Philippine transaction date" value={date} onChangeText={(value) => change('date', value)}
      editable={!disabled} keyboardType="number-pad" autoCorrect={false} returnKeyType="next" submitBehavior="submit"
      onSubmitEditing={() => timeRef.current?.focus()} style={inputStyle} />
    {errors.date ? <ThemedText accessibilityRole="alert">{errors.date}</ThemedText> : null}
    <ThemedText>Time (HH:mm:ss) · 24-hour clock</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Enter six digits, such as 143500 for 14:35:00.</ThemedText>
    <TextInput ref={timeRef} accessibilityLabel="Philippine transaction time" value={time} onChangeText={(value) => change('time', value)}
      editable={!disabled} keyboardType="number-pad" autoCorrect={false} returnKeyType="next" submitBehavior="submit"
      onSubmitEditing={() => notesRef.current?.focus()} style={inputStyle} />
    {errors.time ? <ThemedText accessibilityRole="alert">{errors.time}</ThemedText> : null}
    <ThemedText>Notes (optional)</ThemedText>
    <TextInput ref={notesRef} accessibilityLabel="Transaction notes" value={notes} onChangeText={setNotes} editable={!disabled} multiline style={inputStyle} />
    {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
    <ActionButton label={disabled ? 'Please wait…' : original ? 'Review changes' : 'Save'} disabled={disabled} onPress={submit} />
    <ActionButton label="Cancel" disabled={disabled} onPress={onCancel} />
  </>;
}
