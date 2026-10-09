import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, type Transaction, type TransactionDraft, type ManualTransactionType } from '../types';
import { philippineDateTime } from '../dates';
import { moneyInput, parseMoney } from '../money';
import { ActionButton } from './ui';

type Props = { original?: Transaction; disabled: boolean; error: string; onSubmit: (draft: TransactionDraft) => void; onCancel: () => void };
export function TransactionForm({ original, disabled, error, onSubmit, onCancel }: Props) {
  const theme = useTheme();
  const [defaults] = useState(() => philippineDateTime());
  const [type, setType] = useState<ManualTransactionType>(original?.type === 'INCOME' ? 'INCOME' : 'EXPENSE');
  const [amount, setAmount] = useState(original ? moneyInput(original.amount) : '');
  const [category, setCategory] = useState(original?.category ?? 'Food');
  const [date, setDate] = useState(original?.transactionDate ?? defaults.transactionDate);
  const [time, setTime] = useState(original?.transactionTime ?? defaults.transactionTime);
  const [notes, setNotes] = useState(original?.notes ?? '');
  const [parseError, setParseError] = useState('');
  const inputStyle = { color: theme.text, borderColor: theme.textSecondary, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 };
  function submit() {
    setParseError('');
    try { onSubmit({ type, amount: parseMoney(amount), accountId: 'cash', category,
      transactionDate: date.trim(), transactionTime: time.trim(), notes: notes.trim() || undefined }); }
    catch (cause) { setParseError(cause instanceof Error ? cause.message : 'Invalid input.'); }
  }
  return <>
    <ThemedText>Account: Cash · PHP</ThemedText>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {(['EXPENSE', 'INCOME'] as const).map((value) => <ActionButton key={value}
        label={`${type === value ? '✓ ' : ''}${value === 'INCOME' ? 'Income' : 'Expense'}`} disabled={disabled}
        onPress={() => { setType(value); setCategory(CATEGORIES[value][0]); }} />)}
    </View>
    <ThemedText>Amount in pesos</ThemedText>
    <TextInput accessibilityLabel="Amount in pesos" value={amount} onChangeText={setAmount} editable={!disabled}
      keyboardType="decimal-pad" placeholder="120.00" placeholderTextColor={theme.textSecondary} style={inputStyle} />
    <ThemedText>Category</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {CATEGORIES[type].map((value) => <ActionButton key={value} label={`${category === value ? '✓ ' : ''}${value}`}
        disabled={disabled} onPress={() => setCategory(value)} />)}
    </View>
    <ThemedText>Date (YYYY-MM-DD) · Philippine time</ThemedText>
    <TextInput accessibilityLabel="Philippine transaction date" value={date} onChangeText={setDate} editable={!disabled} autoCorrect={false} style={inputStyle} />
    <ThemedText>Time (HH:mm:ss) · 24-hour clock</ThemedText>
    <TextInput accessibilityLabel="Philippine transaction time" value={time} onChangeText={setTime} editable={!disabled} autoCorrect={false} style={inputStyle} />
    <ThemedText>Notes (optional)</ThemedText>
    <TextInput accessibilityLabel="Transaction notes" value={notes} onChangeText={setNotes} editable={!disabled} multiline style={inputStyle} />
    {parseError || error ? <ThemedText accessibilityRole="alert">{parseError || error}</ThemedText> : null}
    <ActionButton label={disabled ? 'Please wait…' : original ? 'Review changes' : 'Save'} disabled={disabled} onPress={submit} />
    <ActionButton label="Cancel" disabled={disabled} onPress={onCancel} />
  </>;
}
