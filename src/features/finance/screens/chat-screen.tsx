import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { ActionButton, BackButton, FinanceScreen } from '../components/ui';
import { answerAssistant, parseAssistantRequest, type AssistantRequest } from '../assistant';

export default function ChatScreen() {
  const finance = useFinance();
  const theme = useTheme();
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: 'Hi! We can check a purchase, everyday spending, or your savings using your recorded money. These checks do not change your records.' },
  ]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState('');
  const pending = useRef<AssistantRequest | undefined>(undefined);
  const busy = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const locked = sending || finance.busy;
  function reply(text: string) { setMessages((current) => [...current.slice(-19), { role: 'assistant', text }]); }
  async function send(value = text, retry = false) {
    if (busy.current || finance.busy || !value.trim()) return;
    busy.current = true; setSending(true); setFailed('');
    const phrase = value.trim();
    if (!retry) setMessages((current) => [...current.slice(-19), { role: 'user', text: phrase }]);
    setText('');
    try {
      if (/^(stop|cancel|never mind|nevermind)[!. ]*$/i.test(phrase)) { pending.current = undefined; reply('Okay. What would you like to check next?'); return; }
      if (/^(hi|hello|hey|thanks|thank you)[!. ]*$/i.test(phrase)) { reply(/thank/i.test(phrase) ? 'Happy to help!' : 'Hi! What would you like to understand about your money?'); return; }
      const namedGoal = pending.current?.intent === 'savings' && finance.goals.some((goal) => goal.name.toLowerCase() === phrase.toLowerCase());
      let request = namedGoal ? { ...pending.current!, text: phrase } : parseAssistantRequest(phrase, pending.current);
      const answer = answerAssistant(request, finance);
      pending.current = answer.pending;
      reply(answer.text);
    } catch (cause) {
      setFailed(phrase);
      reply(cause instanceof Error ? cause.message : 'I could not complete that check. Please try again.');
    } finally {
      busy.current = false; setSending(false);
    }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen title="Money Check" tabScreen={false} scroll={false} headerLeading={<BackButton disabled={locked} />} headerAccessory={<ActionButton compact label="Help" onPress={() => Alert.alert('Money Check', 'Ask about purchases, daily or weekday costs, monthly spending, budgets, or savings. Give an explicit timeframe for recurring costs. Upcoming commitments are not tracked, so a balance comparison is incomplete. Checks are read-only. Quick Entry opens the separate transaction form. Messages are temporary and stays on this device.')} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ActionButton compact label="Quick Entry" disabled={locked} onPress={() => router.push({ pathname: '/transaction', params: { quick: '1' } })} />
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
        {messages.map((message, index) => <View key={index} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%', padding: 12, borderRadius: 16, backgroundColor: message.role === 'user' ? theme.infoSurface : theme.backgroundElement }}><ThemedText type="small">{message.text}</ThemedText></View>)}
        {sending ? <ThemedText type="small" accessibilityLiveRegion="polite" themeColor="textSecondary">Checking your recorded data...</ThemedText> : null}
        {failed ? <ActionButton compact label="Retry" disabled={locked} onPress={() => { void send(failed, true); }} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {['Can I afford this?', 'Where is my money going?', 'How much did I spend on food?', 'What if I save 500 every month?'].map((question) => <ActionButton key={question} compact label={question} disabled={locked} onPress={() => { pending.current = undefined; void send(question); }} />)}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput accessibilityLabel="Message" value={text} onChangeText={setText} editable={!locked} maxLength={250} placeholder="Ask about your money" placeholderTextColor={theme.textSecondary} returnKeyType="send" onSubmitEditing={() => { void send(); }} style={{ flex: 1, minHeight: 48, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundElement, fontSize: 12 }} />
        <ActionButton compact label="Send" disabled={locked || !text.trim()} onPress={() => { void send(); }} />
      </View>
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
