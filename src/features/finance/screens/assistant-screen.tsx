import { AssistantMascot } from '../components/assistant-mascot';
import { createAssistantReveal } from '../assistant-reveal';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { buildInsightContext, parseInsightSelection, selectAssistantInsight } from '../assistant-insights';
import { AssistantMessage } from '../components/assistant-message';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { FinanceScreen, ActionButton, BackButton } from '../components/ui';
import { assistantQuestionReply, buildAssistantContext, checkedAssistantReply, type AssistantTurn } from '../assistant-context';
import { assistantAvailability, createAssistantSession } from '../offline-assistant';

type Message = AssistantTurn & { id: number; facts?: string[]; fallback?: boolean; offTopic?: boolean; streaming?: boolean; stopped?: boolean };
const starters = ['Where did my money go this month?', 'Can I afford a purchase?', 'How are my budgets doing?'];
export default function AssistantScreen() {
  const finance = useFinance();
  const theme = useTheme();
  const { insight, selection } = useLocalSearchParams<{ insight?: string; selection?: string }>();
  const seed = typeof insight === 'string' ? insight.slice(0, 800) : '';
  const [input, setInput] = useState(seed ? 'Explain this: ' + seed : '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'thinking' | 'answering' | 'stopping'>('idle');
  const [notice, setNotice] = useState('');
  const selected = useRef(parseInsightSelection(selection));
  const insightActive = useRef(Boolean(seed || selected.current));
  const session = useRef<ReturnType<typeof createAssistantSession> | undefined>(undefined);
  const active = useRef(false);
  const epoch = useRef(0);
  function releaseSession() {
    const current = session.current; session.current = undefined;
    sessionCleanup.current = Promise.allSettled([sessionCleanup.current, current?.dispose()]).then(() => {});
  }
  const pending = useRef(false);
  const canceled = useRef(false);
  const invalidated = useRef(false);
  const ids = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const followBottom = useRef(true);
  const [reveal] = useState(createAssistantReveal);
  const latest = useRef(finance); latest.current = finance;
  const sessionCleanup = useRef<Promise<void>>(Promise.resolve());
  useFocusEffect(useCallback(() => {
    active.current = true; ++epoch.current;
    // Wait for the previous native session to release before loading another one.
    session.current = createAssistantSession();
    setStatus('idle'); pending.current = false;
    return () => {
      active.current = false; ++epoch.current; canceled.current = true; reveal.cancel();
      setStatus('idle');
      releaseSession();
      setMessages([]); setInput('');
    };
  }, []));
  const unavailable = assistantAvailability();
  const busy = status !== 'idle';
  function stop() { canceled.current = true; reveal.cancel(); setStatus('stopping'); void session.current?.stop().catch(() => {}); }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        canceled.current = true; reveal.cancel();
        setStatus('idle');
        releaseSession();
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => { if (!finance.assistantEnabled && pending.current) stop(); }, [finance.assistantEnabled]);
  useEffect(() => { if (pending.current) { setNotice('Your records changed. Ask again for an updated answer.'); invalidated.current = true; setMessages(previous => previous.filter(message => !message.streaming)); stop(); } }, [finance.accounts, finance.transactions, finance.budgets, finance.goals]);
  async function send(text = input) {
    const question = text.trim();
    if (!question || pending.current || !finance.assistantEnabled || finance.busy || unavailable) return;
    followBottom.current = true;
    pending.current = true; canceled.current = false; invalidated.current = false; setNotice(''); setStatus('loading'); setInput('');
    const generation = epoch.current;
    const isCurrent = () => active.current && epoch.current === generation;
    const snapshot = finance;
    const user: Message = { id: ++ids.current, role: 'user', text: question.slice(0, 1000) };
    const history = messages.filter(message => !message.offTopic).slice(-4);
    if (!selected.current && (seed || /^explain this:/i.test(user.text))) { selected.current = selectAssistantInsight(seed || user.text.replace(/^explain this:\s*/i, ''), finance); insightActive.current = true; }
    const insightFollowup = selected.current && insightActive.current && /explain|why|compar|last month|previous month|adjust|reduce|cut back|tell me more|what about/i.test(user.text) && !/\b(?:buy|afford|purchase|controller|costs?|price)\b/i.test(user.text);
    const direct = assistantQuestionReply(insightFollowup ? 'money ' + user.text : user.text, history);
    user.offTopic = Boolean(direct);
    if (!direct) insightActive.current = Boolean(insightFollowup);
    const replyId = ++ids.current;
    setMessages(current => [...current.slice(-11), user, { id: replyId, role: 'assistant', text: '', streaming: true, offTopic: Boolean(direct) }]);
    let streamed = '';
    const updateReply = (text: string, streaming: boolean, fallback = false) => {
      const current = latest.current;
      if (!isCurrent() || current.accounts !== snapshot.accounts || current.transactions !== snapshot.transactions || current.budgets !== snapshot.budgets || current.goals !== snapshot.goals) return;
      setMessages(previous => previous.map(message => message.id === replyId ? { ...message, text, streaming, fallback, facts: streaming ? undefined : context?.summary } : message));
    };
    let context: ReturnType<typeof buildAssistantContext> | undefined;
    async function finishReply(text: string, fallback = false) {
      if (!isCurrent() || canceled.current) return;
      setStatus('answering');
      const prefix = !fallback && text.startsWith(streamed) ? streamed : '';
      updateReply(prefix, true, fallback);
      const complete = await reveal.reveal(text, prefix, value => updateReply(value, true, fallback));
      if (complete && !canceled.current) updateReply(text, false, fallback);
    }
    try {
      if (direct) {
        await finishReply(direct);
        return;
      }
      context = insightFollowup && selected.current ? buildInsightContext(snapshot, selected.current, user.text) : buildAssistantContext(snapshot, user.text, history);
      await sessionCleanup.current;
      if (!isCurrent() || canceled.current) return;
      session.current ??= createAssistantSession();
      const reply = await session.current.ask(user.text, context, history, value => { if (isCurrent() && !canceled.current) setStatus(value); }, text => { if (!canceled.current && isCurrent()) void reveal.reveal(text, streamed, value => { streamed = value; updateReply(value, true); }); });
      const current = latest.current;
      if (!isCurrent() || canceled.current || current.accounts !== snapshot.accounts || current.transactions !== snapshot.transactions || current.budgets !== snapshot.budgets || current.goals !== snapshot.goals) return;
      const checked = checkedAssistantReply(reply, context, user.text);
      await finishReply(checked ?? context.fallback, !checked);
    } catch (cause) {
      if (isCurrent() && !canceled.current) {
        setNotice('The assistant could not finish this reply. You can try again.');
        if (context && replyId !== undefined) await finishReply(context.fallback, true);
        else setNotice(cause instanceof Error ? cause.message : 'Could not read your records.');
        releaseSession();
      }
    } finally { if (isCurrent()) {
      if (canceled.current && replyId !== undefined) setMessages(previous => previous.filter(message => message.id !== replyId || (!invalidated.current && Boolean(message.text))).map(message => message.id === replyId ? { ...message, streaming: false, stopped: true } : message));
      setMessages(previous => previous.filter(message => message.id !== replyId || Boolean(message.text)));
      pending.current = false; setStatus('idle');
    } }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen title="Money assistant" tabScreen={false} scroll={false} headerLeading={<BackButton onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />}>
      {!finance.assistantEnabled ? <View style={{ gap: 8 }}><ThemedText>Offline chat is disabled.</ThemedText><ActionButton label="Open Settings" onPress={() => router.navigate('/settings')} /></View> : unavailable ? <ThemedText>{unavailable}</ThemedText> : null}
      <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingVertical: 8 }} onScrollBeginDrag={() => { followBottom.current = false; }} scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => { followBottom.current = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 48; }}
        onContentSizeChange={() => { if (followBottom.current) scroll.current?.scrollToEnd({ animated: false }); }}>
        {!messages.length ? <View style={{ gap: 10 }}>
          <AssistantMascot size={72} />
          <ThemedText type="small">Ask about your balances, spending, budgets, or a purchase. Replies use your recorded activity.</ThemedText>
          {starters.map(question => <ActionButton key={question} compact label={question} disabled={busy || !finance.assistantEnabled || Boolean(unavailable)} onPress={() => { void send(question); }} />)}
        </View> : null}
        {messages.map(message => {
          const waiting = message.role === 'assistant' && message.streaming && !message.text && busy;
          if (message.role === 'assistant' && !message.text && !waiting) return null;
          return <View key={message.id} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'stretch', maxWidth: message.role === 'user' ? '90%' : '100%', padding: 12, borderRadius: 16, gap: 8, backgroundColor: message.role === 'user' ? theme.backgroundSelected : theme.backgroundElement }}>
            {waiting ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AssistantMascot thinking animated={status !== 'stopping'} size={48}>
              <ThemedText type="small" accessibilityLiveRegion="polite">{status === 'loading' ? 'Preparing assistant...' : status === 'stopping' ? 'Stopping...' : status === 'thinking' ? 'Thinking...' : 'Replying...'}</ThemedText>
              </AssistantMascot>
            </View> : <>
              {message.role === 'user' || message.stopped || message.fallback ? <ThemedText type="smallBold">{message.role === 'user' ? 'You' : message.stopped ? 'Stopped' : 'Recorded summary'}</ThemedText> : null}
              <View>{message.role === 'assistant' ? <AssistantMessage text={message.text} streaming={message.streaming} /> : <ThemedText type="small" selectable>{message.text}</ThemedText>}</View>
              {message.facts ? <View style={{ gap: 3, paddingTop: 4 }}><ThemedText type="smallBold" themeColor="textSecondary">Based on your records</ThemedText>{message.facts.map(fact => <ThemedText key={fact} type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 16 }}>{fact}</ThemedText>)}</View> : null}
            </>}
          </View>;
        })}
        {notice ? <ThemedText type="small" accessibilityLiveRegion="polite" themeColor="textSecondary">{notice}</ThemedText> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <TextInput accessibilityLabel="Ask about your money" value={input} maxLength={1000} onChangeText={setInput} multiline editable={!busy && finance.assistantEnabled && !unavailable} placeholder="Ask about your money" placeholderTextColor={theme.textSecondary}
          selectionColor={theme.accent} cursorColor={theme.accent} selectionHandleColor={theme.accent} underlineColorAndroid="transparent" style={{ flex: 1, maxHeight: 120, minHeight: 48, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12, color: theme.text }} />
        {busy ? <ActionButton compact label="Stop" disabled={status === 'stopping'} onPress={stop} /> : <ActionButton compact primary label="Send" disabled={!input.trim() || finance.busy || !finance.assistantEnabled || Boolean(unavailable)} onPress={() => { void send(); }} />}
      </View>
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
