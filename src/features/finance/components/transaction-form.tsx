import { useFinance } from '../provider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { CategoryIcon, categoryVisual } from './category-visual';
import { useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORIES, type Transaction, type TransactionDraft, type ManualTransactionType } from '../types';
import { philippineDateTime, isValidDate, isValidTime } from '../dates';
import { moneyInput, parseMoney, formatMoney } from '../money';
import { formatEditableMoney } from '../inputs';
import { calculateAccountSummary } from '../calculations';
import { defaultEntryAccount, previewTransfer } from '../workflows';
import { MoneyField } from './money-field';
import { TransactionDateTime } from './transaction-date-time';
import { ActionButton } from './ui';

type Props = { transferOnly?: boolean; initialDraft?: TransactionDraft; original?: Transaction; initialAccountId?: string; initialDestinationAccountId?: string; initialType?: ManualTransactionType; disabled: boolean; error: string; onSubmit: (draft: TransactionDraft) => void; onCancel: () => void; onTypeChange: (type: ManualTransactionType) => void };
type Field = 'amount' | 'date' | 'time';
export function TransactionForm({ transferOnly = false, initialDraft, original, initialAccountId, initialDestinationAccountId, initialType = 'EXPENSE', disabled, error, onSubmit, onCancel, onTypeChange }: Props) {
  const theme = useTheme();
  const { accounts, transactions, lastEntryAccount } = useFinance();
  const [accountOpen, setAccountOpen] = useState(false);
  const [choosingDestination, setChoosingDestination] = useState(false);
  const [destinationAccountId, setDestinationAccountId] = useState(original?.destinationAccountId ?? initialDraft?.destinationAccountId ?? initialDestinationAccountId ?? '');
  const [accountId, setAccountId] = useState(original?.accountId ?? initialDraft?.accountId ?? defaultEntryAccount(accounts, initialAccountId, lastEntryAccount, initialDestinationAccountId));
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const { height, fontScale } = useWindowDimensions();
  const [amountWidth, setAmountWidth] = useState(0);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [defaults] = useState(() => philippineDateTime());
  const [type, setType] = useState<ManualTransactionType>(original?.type === 'TRANSFER' ? 'TRANSFER' : original?.type === 'INCOME' ? 'INCOME' : original ? 'EXPENSE' : initialDraft?.type ?? initialType);
  const [amount, setAmount] = useState(original ? formatEditableMoney(moneyInput(original.amount))! : initialDraft ? formatEditableMoney(moneyInput(initialDraft.amount))! : '');
  const amountFontSize = amountWidth > 0 ? Math.max(20, Math.min(30, Math.floor(amountWidth / ((Math.max(amount.length, 1) + 1) * 0.65 * fontScale)))) : 30;
  const [category, setCategory] = useState(original?.category ?? initialDraft?.category ?? (initialType === 'TRANSFER' ? 'Transfer' : CATEGORIES[initialType][0]));
  const [date, setDate] = useState(original?.transactionDate ?? initialDraft?.transactionDate ?? defaults.transactionDate);
  const [time, setTime] = useState(original?.transactionTime ?? initialDraft?.transactionTime ?? defaults.transactionTime);
  const [notes, setNotes] = useState(original?.notes ?? initialDraft?.notes ?? '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const notesRef = useRef<TextInput>(null);
  let transferPreview: ReturnType<typeof previewTransfer> | undefined;
  let previewError = '';
  if (type === 'TRANSFER' && accountId && destinationAccountId && amount && !errors.amount) {
    try { transferPreview = previewTransfer(accounts, transactions, { type, accountId, destinationAccountId, category: 'Transfer', amount: parseMoney(amount.replace(/,/g, '')), transactionDate: date, transactionTime: time }, original); }
    catch (cause) { previewError = cause instanceof Error ? cause.message : 'Could not preview balances.'; }
  }
  const inputStyle = { color: theme.text, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 12 };
  function submit() {
    const issues = { ...errors };
    let cents = 0;
    try { cents = parseMoney(amount.replace(/,/g, '')); } catch (cause) { issues.amount = cause instanceof Error ? cause.message : 'Invalid amount.'; }
    if (!isValidDate(date)) issues.date = 'Enter a real date as YYYY-MM-DD (1900-9999).';
    if (!isValidTime(time)) issues.time = 'Enter a valid 24-hour time as HH:mm:ss.';
    setErrors(issues);
    if (Object.values(issues).some(Boolean)) return;
    onSubmit({ type, destinationAccountId: type === 'TRANSFER' ? destinationAccountId : undefined, amount: cents, accountId, category, transactionDate: date, transactionTime: time, notes: notes.trim() || undefined });
  }
  return <View style={{ flex: 1, gap: 12 }}>
    <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ gap: 10, padding: 12, paddingBottom: 32, backgroundColor: theme.backgroundElement, borderRadius: 20 }}>

    {!transferOnly ? <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(original?.type === 'TRANSFER' ? ['TRANSFER'] as const : ['EXPENSE', 'INCOME'] as const).map((value) => <ActionButton key={value} selected={type === value}
        compact label={value === 'TRANSFER' ? 'Transfer' : value === 'INCOME' ? 'Income' : 'Expense'} disabled={disabled}
        onPress={() => { if (type !== value) { setType(value); onTypeChange(value); setCategory(value === 'TRANSFER' ? 'Transfer' : CATEGORIES[value][0]); } }} />)}
    </View>
    </> : null}
    {type === 'TRANSFER' ? <>
      <ThemedText type="smallBold">{type === "TRANSFER" ? "From account" : "Account"}</ThemedText>
    <Pressable accessibilityRole="button" accessibilityLabel={'Choose account, ' + (selectedAccount?.name ?? 'No active account')} accessibilityState={{ disabled }} disabled={disabled}
      onPress={() => { Keyboard.dismiss(); setChoosingDestination(false); setAccountOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minHeight: 48, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }}>
      <Ionicons name="wallet-outline" size={20} color={theme.textSecondary} />
      <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{selectedAccount?.name ?? 'Choose an account'} · PHP{selectedAccount?.archived ? ' · Archived' : ''}</ThemedText>
      <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
    </Pressable>
    {selectedAccount?.archived && <ThemedText accessibilityRole="alert">Unarchive this account in Settings before editing its transactions.</ThemedText>}
    {!accounts.some((account) => !account.archived) && <ThemedText accessibilityRole="alert">Add or unarchive an account in Settings to record transactions.</ThemedText>}
    {type === 'TRANSFER' && <>
      <ThemedText type="smallBold">To account</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose destination account" disabled={disabled} onPress={() => { Keyboard.dismiss(); setChoosingDestination(true); setAccountOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minHeight: 48, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }}>
        <Ionicons name="wallet-outline" size={20} color={theme.textSecondary} /><ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{accounts.find((account) => account.id === destinationAccountId)?.name ?? 'Choose destination account'}</ThemedText><Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
      </Pressable>
      {transferPreview && <View style={{ gap: 6, backgroundColor: theme.background, borderRadius: 12, padding: 12 }}>
        <ThemedText type="smallBold">Balances after saving</ThemedText>
        <ThemedText type="small">{selectedAccount?.name}: {formatMoney(transferPreview.sourceBalance)}</ThemedText>
        <ThemedText type="small">{accounts.find((account) => account.id === destinationAccountId)?.name}: {formatMoney(transferPreview.destinationBalance)}</ThemedText>
        {(transferPreview.sourceBalance < 0 || transferPreview.destinationBalance < 0) && <ThemedText accessibilityRole="alert" style={{ color: theme.warning, backgroundColor: theme.warningSurface }}>Warning: an account will have a negative balance.</ThemedText>}
      </View>}
      {previewError ? <ThemedText accessibilityRole="alert">{previewError}</ThemedText> : null}
      {accounts.filter((account) => !account.archived).length < 2 && <ThemedText accessibilityRole="alert">Add or unarchive another account to make a transfer.</ThemedText>}
    </>}
</> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: type === 'INCOME' ? theme.incomeSurface : theme.expenseSurface, padding: 12, minHeight: 108 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Category: ' + category + '. Change category.'} accessibilityState={{ disabled }} disabled={disabled || type === 'TRANSFER'}
        onPress={() => { Keyboard.dismiss(); setCategoryOpen(true); }} style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: categoryVisual(category, type === 'INCOME').color + '20', opacity: pressed || disabled ? 0.5 : 1 })}>
        <Ionicons name={categoryVisual(category, type === 'INCOME').icon} size={32} color={categoryVisual(category, type === 'INCOME').color} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View onLayout={(event) => setAmountWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 52 }}>
          <ThemedText style={{ fontSize: amountFontSize, lineHeight: Math.ceil(amountFontSize * 1.3), fontWeight: '700' }}>₱</ThemedText>
          <MoneyField accessibilityLabel="Amount in pesos" value={amount} onValueChange={(value) => { setAmount(value); setErrors((current) => ({ ...current, amount: undefined })); }} onRejected={() => setErrors((current) => ({ ...current, amount: 'Use digits and up to two decimal places. Input was not accepted.' }))} editable={!disabled}
            autoFocus={!original && !initialDraft} keyboardType="decimal-pad" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => notesRef.current?.focus()}
            placeholder="0" placeholderTextColor={theme.textSecondary} style={{ flex: 1, minWidth: 0, color: theme.text, paddingVertical: 4, paddingHorizontal: 0, fontSize: amountFontSize, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] }} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={'Category: ' + category + '. Change category.'} accessibilityState={{ disabled }} disabled={disabled || type === 'TRANSFER'}
          onPress={() => { Keyboard.dismiss(); setCategoryOpen(true); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <ThemedText numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, fontSize: 12, lineHeight: 18, textAlign: 'right' }}>{category}</ThemedText>
          {type !== "TRANSFER" && <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />}
        </Pressable>
      </View>
    </View>
    {errors.amount ? <ThemedText accessibilityRole="alert">{errors.amount}</ThemedText> : null}
    <ThemedText type="smallBold">Notes (optional)</ThemedText>
    <TextInput ref={notesRef} accessibilityLabel="Transaction notes" value={notes} onChangeText={setNotes} editable={!disabled} multiline placeholder="Add a note…" placeholderTextColor={theme.textSecondary} style={[inputStyle, { minHeight: 64, textAlignVertical: 'top' }]} />
    <TransactionDateTime date={date} time={time} disabled={disabled}
      onDateChange={(value) => { setDate(value); setErrors((current) => ({ ...current, date: undefined })); }}
      onTimeChange={(value) => { setTime(value); setErrors((current) => ({ ...current, time: undefined })); }} />
    {errors.date ? <ThemedText accessibilityRole="alert">{errors.date}</ThemedText> : null}
    {errors.time ? <ThemedText accessibilityRole="alert">{errors.time}</ThemedText> : null}
    {type !== 'TRANSFER' ? <>
      <ThemedText type="smallBold">Account</ThemedText>
    <Pressable accessibilityRole="button" accessibilityLabel={'Choose account, ' + (selectedAccount?.name ?? 'No active account')} accessibilityState={{ disabled }} disabled={disabled}
      onPress={() => { Keyboard.dismiss(); setChoosingDestination(false); setAccountOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minHeight: 48, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }}>
      <Ionicons name="wallet-outline" size={20} color={theme.textSecondary} />
      <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{selectedAccount?.name ?? 'Choose an account'} · PHP{selectedAccount?.archived ? ' · Archived' : ''}</ThemedText>
      <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
    </Pressable>
    {selectedAccount?.archived && <ThemedText accessibilityRole="alert">Unarchive this account in Settings before editing its transactions.</ThemedText>}
    {!accounts.some((account) => !account.archived) && <ThemedText accessibilityRole="alert">Add or unarchive an account in Settings to record transactions.</ThemedText>}
</> : null}
    {error ? <ThemedText accessibilityRole="alert" style={{ color: theme.error, backgroundColor: theme.errorSurface }}>{error}</ThemedText> : null}
    </ScrollView>
    <View style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderColor: theme.border }}>
        <Pressable accessibilityRole="button" accessibilityLabel={original ? 'Review changes' : type === 'TRANSFER' ? 'Save transfer' : 'Save'} accessibilityState={{ disabled }} disabled={disabled} onPress={submit}>
      <View style={{ backgroundColor: disabled ? theme.disabledBackground : theme.accentPressed, padding: 16, minHeight: 50, borderRadius: 14, alignItems: 'center', opacity: disabled ? 0.5 : 1 }}>
        <ThemedText type="smallBold" style={{ color: disabled ? theme.disabledText : theme.onAccent }}>{disabled ? 'Please wait…' : original ? 'Review changes' : type === 'TRANSFER' ? 'Save transfer' : 'Save'}</ThemedText>
      </View>
    </Pressable>
    <ActionButton compact label="Cancel" disabled={disabled} onPress={onCancel} />
    </View>
    <Modal visible={accountOpen} transparent animationType="fade" onRequestClose={() => setAccountOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close account picker" onPress={() => setAccountOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: height * 0.8, backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View accessibilityViewIsModal style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText type="smallBold">Choose account</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close account picker" onPress={() => setAccountOpen(false)} style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={24} color={theme.text} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.55 }}>
              {accounts.filter((account) => !account.archived && (!choosingDestination || account.id !== accountId)).map((account) => <Pressable key={account.id} accessibilityRole="button" accessibilityLabel={account.name} accessibilityState={{ selected: account.id === (choosingDestination ? destinationAccountId : accountId), disabled }} disabled={disabled}
                onPress={() => { if (choosingDestination) setDestinationAccountId(account.id); else setAccountId(account.id); if (!choosingDestination && destinationAccountId === account.id) setDestinationAccountId(''); setAccountOpen(false); }} style={{ minHeight: 52, padding: 12, marginBottom: 8, borderRadius: 12, backgroundColor: account.id === (choosingDestination ? destinationAccountId : accountId) ? theme.backgroundSelected : theme.background, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="wallet-outline" size={22} color={theme.accent} />
                <View style={{ flex: 1, minWidth: 0 }}><ThemedText numberOfLines={1} ellipsizeMode="tail">{account.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{formatMoney(calculateAccountSummary(account, transactions, "1900-01").balance)}</ThemedText></View>
                {account.id === (choosingDestination ? destinationAccountId : accountId) && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
              </Pressable>)}
              {!accounts.some((account) => !account.archived) && <ThemedText>No active accounts. Add or unarchive one in Settings.</ThemedText>}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
    <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close category picker" onPress={() => setCategoryOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: height * 0.8, backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View accessibilityViewIsModal style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <ThemedText type="smallBold" accessibilityRole="header">Choose category</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close category picker" onPress={() => setCategoryOpen(false)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={24} color={theme.text} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.55 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(type === 'TRANSFER' ? [] : CATEGORIES[type]).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: value === category, disabled }} disabled={disabled}
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
