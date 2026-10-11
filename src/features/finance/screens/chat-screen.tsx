import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { parseQuickEntry } from '../quick-entry';
import { validateDraft } from '../validation';
import type { TransactionDraft } from '../types';
import { formatMoney, moneyInput, parseMoney } from '../money';
import { formatEditableMoney } from '../inputs';
import { formatTransactionDateTime } from '../dates';
import { ActionButton, BackButton, FinanceScreen } from '../components/ui';




export default function ChatScreen() {
  const finance = useFinance();
  const theme = useTheme();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([{ role: 'assistant', text: 'Describe one income or expense, such as Lunch 120. I will prepare a draft for your approval. This uses offline rules, not a conversational AI model.' }]);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<TransactionDraft>();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const submission = useRef<string | undefined>(undefined);
  const scroll = useRef<ScrollView>(null);
  const locked = saving || finance.busy;
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => pending.current || saving);
    return () => listener.remove();
  }, [saving]);
  function reply(message: string) { setMessages((current) => [...current.slice(-39), { role: 'assistant', text: message }]); }
  function send() {
    if (locked || draft || !text.trim()) return;
    const phrase = text.trim();
    setMessages((current) => [...current.slice(-39), { role: 'user', text: phrase }]);
    setText(''); setError('');
    try {
      const result = parseQuickEntry(phrase, finance.accounts, new Date(), undefined, finance.lastEntryAccount);
      submission.current = undefined;
      setDraft(result.draft); setAmount(formatEditableMoney(moneyInput(result.draft.amount))!);
      reply(result.warnings.join(' ') + ' Please confirm the transaction type and details below.');
    } catch (cause) { reply((cause instanceof Error ? cause.message : 'Could not understand that.') + ' Send the complete corrected phrase to try again.'); }
  }
  async function save() {
    if (!draft || locked || pending.current) return;
    pending.current = true; setSaving(true); setError('');
    try {
      const candidate = { ...draft, amount: parseMoney(amount.replace(/,/g, '')) };
      const account = finance.accounts.find((row) => row.id === candidate.accountId);
      if (!account) throw new Error('Choose an active account.');
      validateDraft(candidate, account);
      const id = submission.current ??= await finance.newSubmissionId();
      await finance.saveTransaction(id, candidate, false);
      reply('Saved ' + candidate.category + ': ' + formatMoney(candidate.amount) + '. Use the notification Undo to remove it within 10 seconds.');
      submission.current = undefined; setDraft(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your draft is kept.'); }
    finally { pending.current = false; setSaving(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen title="Chat" tabScreen={false} scroll={false} headerLeading={<BackButton disabled={locked} />} headerAccessory={<ActionButton compact label="Help" onPress={() => Alert.alert('Offline Quick Chat', 'Use one PHP income or expense per message. Try Lunch 120, Salary 25,000, or Pamasahe 30 kahapon from Cash. Review and approve every draft. Transfers use the Transfer screen. Messages are temporary and stay on this device.')} />}>
      <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
        {messages.map((message, index) => <View key={index} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%', padding: 12, borderRadius: 16, backgroundColor: message.role === 'user' ? theme.infoSurface : theme.backgroundElement }}><ThemedText type="small">{message.text}</ThemedText></View>)}
        {draft ? <View style={{ padding: 14, borderRadius: 18, gap: 10, backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border }}>
          <ThemedText type="smallBold">Review transaction</ThemedText>
          <ThemedText type="small">{draft.type === 'INCOME' ? 'Income' : 'Expense'} / {draft.category}</ThemedText>
          <ThemedText type="smallBold">{amount ? 'PHP ' + amount : 'Enter an amount'}</ThemedText>
          <ThemedText type="small">{finance.accounts.find((row) => row.id === draft.accountId)?.name ?? 'Choose account'}</ThemedText>
          <ThemedText type="small">{formatTransactionDateTime(draft.transactionDate, draft.transactionTime)}</ThemedText>
          {draft.notes ? <ThemedText type="small">{draft.notes}</ThemedText> : null}
          {error ? <ThemedText accessibilityRole="alert" style={{ color: theme.error }}>{error}</ThemedText> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><ActionButton compact primary label={saving ? 'Saving...' : 'Save'} disabled={locked} onPress={() => { void save(); }} /></View>
            <View style={{ flex: 1 }}><ActionButton compact label="Cancel" disabled={locked} onPress={() => { setDraft(undefined); setError(''); submission.current = undefined; reply('Draft canceled. Nothing was saved. Send a corrected message to try again.'); }} /></View>
          </View>
        </View> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput accessibilityLabel="Message" value={text} onChangeText={setText} editable={!locked && !draft} maxLength={250} placeholder={draft ? 'Review the draft above' : 'Describe an income or expense'} placeholderTextColor={theme.textSecondary} returnKeyType="send" onSubmitEditing={send} style={{ flex: 1, minHeight: 48, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement, fontSize: 12 }} />
        <ActionButton compact label="Send" disabled={locked || Boolean(draft) || !text.trim()} onPress={send} />
      </View>
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
