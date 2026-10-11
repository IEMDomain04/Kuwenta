import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { moneyInsights } from '../insights';
import { router } from 'expo-router';
import { CategoryIcon } from '../components/category-visual';
import { philippineDateTime, formatTransactionDateTime } from '../dates';
import { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { dashboardGreeting, dashboardReport } from '../dashboard';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import { FinanceScreen, AddTransactionButton } from '../components/ui';
import { BudgetOverview } from '../components/budget-overview';
import { PeriodOverview } from '../components/period-overview';

const mascotImages = {
  friendly: require('../../../../assets/images/mascot/friendly.png'),
  thinking: require('../../../../assets/images/mascot/thinking.png'),
  celebrating: require('../../../../assets/images/mascot/celebrating.png'),
  encouraging: require('../../../../assets/images/mascot/encouraging.png'),
  concerned: require('../../../../assets/images/mascot/concerned.png'),
};

export default function HomeScreen() {
  const { displayName, accounts, transactions, budgets, goals, month, busy } = useFinance();
  const theme = useTheme();
  const { height, fontScale } = useWindowDimensions();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') setNow(new Date()); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const recent = transactions.filter((row) => row.type !== 'EXTERNAL').sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.transactionTime.localeCompare(a.transactionTime) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 5);
  const hasActivity = transactions.some((record) => record.type === 'INCOME' || record.type === 'EXPENSE');
  const today = dashboardReport(transactions, 'day', month, now);
  const dateLabel = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const message = !hasActivity ? 'Your money story starts here. Record your first income or expense to see your activity.'
    : today.expenses ? 'You recorded ' + formatMoney(today.expenses) + ' in expenses today. Review your activity below to see where you stand.'
    : today.income ? 'You recorded ' + formatMoney(today.income) + ' in income today. Keep recording your activity to build a clearer picture.'
    : 'No income or expenses recorded today. Your previous activity is ready to review below.';
  let insights: string[] = [];
  try { insights = moneyInsights(accounts, transactions, budgets, goals, now); }
  catch { insights = ['Insights are unavailable. Review your records in Accounts and History.']; }
  const insightMessage = insights[0] ?? message;
  // Expressions describe the displayed insight; they never change financial records.
  const reaction = /over budget|budget used|transferred out/i.test(insightMessage) ? 'concerned'
    : /target reached/i.test(insightMessage) ? 'celebrating'
    : /transferred into savings|funded|lower compared/i.test(insightMessage) ? 'encouraging'
    : insights.length ? 'thinking' : 'friendly';
  return <FinanceScreen title="Kuwenta" floatingAction={<AddTransactionButton disabled={busy} />}>
    <View style={styles.greeting}>
      <ThemedText type="small" themeColor="textSecondary">{dateLabel}</ThemedText>
      <ThemedText accessibilityRole="header" style={styles.heading}>{dashboardGreeting(displayName ?? '', now)}</ThemedText>
    </View>
    <LinearGradient colors={[theme.backgroundSelected, theme.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.insight}>
      <Image source={mascotImages[reaction]} contentFit="contain" accessible={false} style={styles.mascot} />
      <Pressable accessibilityRole="button" accessibilityLabel="View money insights" accessibilityHint="Opens full insight details" onPress={() => setInsightsOpen(true)} style={({ pressed }) => [styles.bubble, { backgroundColor: theme.backgroundElement, borderColor: theme.accent, opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.bubbleTail, { backgroundColor: theme.backgroundElement, borderColor: theme.accent }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ThemedText type="smallBold" style={{ flex: 1, color: theme.income, fontSize: 12, lineHeight: 17 }}>Kuwenta</ThemedText>
          <Ionicons accessible={false} name="chevron-forward" size={14} color={theme.textSecondary} />
        </View>
        <ThemedText numberOfLines={fontScale > 1.3 ? undefined : 3} ellipsizeMode="tail" style={styles.message}>{insightMessage}</ThemedText>
      </Pressable>
    </LinearGradient>
    <Modal visible={insightsOpen} transparent animationType="fade" onRequestClose={() => setInsightsOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close insights" onPress={() => setInsightsOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: height * 0.8, backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View accessibilityViewIsModal style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ThemedText type="smallBold" accessibilityRole="header" style={{ flex: 1 }}>Your money, at a glance</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close insights" onPress={() => setInsightsOpen(false)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={20} color={theme.text} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.55 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              {(insights.length ? insights : [message]).map((insight, index) => <View key={insight} style={{ paddingTop: index ? 12 : 0, borderTopWidth: index ? 1 : 0, borderColor: theme.border }}><ThemedText type="small">{insight}</ThemedText></View>)}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
    {hasActivity ? <PeriodOverview now={now} /> : null}
    <BudgetOverview compact reportingMonth={philippineDateTime(now).transactionDate.slice(0, 7)} />
    {recent.length > 0 ? <View style={{ backgroundColor: theme.backgroundElement, borderRadius: 20, padding: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <ThemedText type="smallBold" style={{ fontSize: 13 }} accessibilityRole="header">Recent transactions</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="See all transactions" onPress={() => router.navigate('/transactions')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><ThemedText type="small" themeColor="accent">See all</ThemedText></Pressable>
      </View>
      {recent.map((transaction, index) => {
        const account = accounts.find((row) => row.id === transaction.accountId)?.name ?? 'Unknown account';
        const destination = accounts.find((row) => row.id === transaction.destinationAccountId)?.name ?? 'Unknown account';
        const transfer = transaction.type === 'TRANSFER';
        const increase = transaction.type === 'INCOME' || transaction.type === 'ADJUSTMENT' && transaction.adjustmentDirection === 'increase';
        return <Pressable key={transaction.id} disabled={busy} accessibilityRole="button" accessibilityLabel={(transaction.type === 'ADJUSTMENT' ? 'View account for ' : 'Edit ') + transaction.category + ', ' + formatMoney(transaction.amount) + ', ' + formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime)}
          onPress={() => router.push({ pathname: transaction.type === 'ADJUSTMENT' ? '/account' : '/transaction', params: { id: transaction.type === 'ADJUSTMENT' ? transaction.accountId : transaction.id } })}
          style={({ pressed }) => ({ minHeight: 64, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTopWidth: index ? 1 : 0, borderColor: theme.border, opacity: pressed || busy ? 0.5 : 1 })}>
          <CategoryIcon category={transaction.category} income={transaction.type === 'INCOME'} compact />
          <View style={{ flex: 1, minWidth: 100, gap: 2 }}>
            <ThemedText type="smallBold" numberOfLines={1}>{transaction.notes || transaction.category}</ThemedText>
            <ThemedText type="small" numberOfLines={1} themeColor="textSecondary">{transfer ? account + ' → ' + destination : transaction.category + ' / ' + account}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 16 }}>{formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime)}</ThemedText>
          </View>
          <ThemedText type="smallBold" style={{ color: transaction.type === 'INCOME' ? theme.income : theme.text, fontVariant: ['tabular-nums'], flexShrink: 1 }}>{transfer ? '' : increase ? '+' : '−'}{formatMoney(transaction.amount)}</ThemedText>
        </Pressable>;
      })}
    </View> : null}
  </FinanceScreen>;
}
const styles = StyleSheet.create({
  greeting: { gap: 4, paddingTop: 6, paddingBottom: 12 },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '600' },
  insight: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 22, gap: 10 },
  mascot: { width: 80, height: 94, flexShrink: 0 },
  bubble: { flex: 1, minWidth: 0, padding: 12, borderRadius: 18, borderWidth: 1, gap: 4 },
  bubbleTail: { position: 'absolute', left: -5, top: 24, width: 10, height: 10, borderLeftWidth: 1, borderBottomWidth: 1, transform: [{ rotate: '45deg' }] },
  message: { fontSize: 12, lineHeight: 18 },
});
