import { moneyInsights } from '../insights';
import { router } from 'expo-router';
import { CategoryIcon } from '../components/category-visual';
import { formatTransactionDateTime } from '../dates';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { dashboardGreeting, dashboardReport } from '../dashboard';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import { FinanceScreen, AddTransactionButton } from '../components/ui';
import { PeriodOverview } from '../components/period-overview';

export default function HomeScreen() {
  const { displayName, accounts, transactions, budgets, goals, month, busy } = useFinance();
  const theme = useTheme();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') setNow(new Date()); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const recent = [...transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.transactionTime.localeCompare(a.transactionTime) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 5);
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
  return <FinanceScreen title="Kuwenta" floatingAction={<AddTransactionButton disabled={busy} />}>
    <View style={styles.greeting}>
      <ThemedText type="small" themeColor="textSecondary">{dateLabel}</ThemedText>
      <ThemedText accessibilityRole="header" style={styles.heading}>{dashboardGreeting(displayName ?? '', now)}</ThemedText>
    </View>
    <View style={[styles.insight, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.icon, { backgroundColor: theme.incomeSurface }]}><Ionicons name="bulb-outline" size={24} color={theme.accent} /></View>
      <View style={{ flex: 1, gap: 4 }}>
        <ThemedText type="smallBold" style={{ fontSize: 13, lineHeight: 18 }}>Your money, at a glance</ThemedText>
        <ThemedText style={styles.message}>{insights[0] ?? message}</ThemedText>
        {insights.slice(1).map((insight) => <ThemedText key={insight} style={styles.message}>{insight}</ThemedText>)}
      </View>
    </View>
    {hasActivity ? <PeriodOverview now={now} /> : null}
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
  insight: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 22, borderWidth: 1, gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  message: { fontSize: 12, lineHeight: 18 },
});
