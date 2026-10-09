import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton, FinanceScreen, TransactionRow } from '../components/ui';
import { MonthSelector } from '../components/month-selector';
import { filterTransactions } from '../reporting';
import { formatMoney } from '../money';
import { useFinance } from '../provider';

export default function HomeScreen() {
  const { account, transactions, summary, month, busy } = useFinance();
  const recent = filterTransactions(transactions, month).slice(0, 5);
  return <FinanceScreen title="Your money">
    <ThemedText type="small" themeColor="textSecondary">Kuwenta · PHP</ThemedText>
    <ThemedView type="backgroundElement" style={styles.balance}>
      <ThemedText type="smallBold">{account.name} balance</ThemedText>
      <ThemedText style={styles.balanceAmount}>{formatMoney(summary.balance)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Opening balance plus all recorded income, minus all expenses.</ThemedText>
      {summary.hasNegativeBalance && <ThemedText accessibilityRole="alert">Your Cash balance is negative. Review your records and opening balance.</ThemedText>}
    </ThemedView>
    <View style={styles.row}>
      <View style={styles.action}><ActionButton primary label="Add Expense" disabled={busy}
        onPress={() => router.push({ pathname: '/transaction', params: { type: 'EXPENSE' } })} /></View>
      <View style={styles.action}><ActionButton label="Add Income" disabled={busy}
        onPress={() => router.push({ pathname: '/transaction', params: { type: 'INCOME' } })} /></View>
    </View>
    <ThemedView type="backgroundElement" style={styles.section}>
      <ThemedText type="smallBold" accessibilityRole="header">Monthly overview</ThemedText>
      <MonthSelector />
      <View style={styles.row}>
        <View style={styles.total}>
          <ThemedText type="small" themeColor="textSecondary">Income</ThemedText>
          <ThemedText style={styles.totalAmount}>{formatMoney(summary.monthlyIncome)}</ThemedText>
        </View>
        <View style={styles.total}>
          <ThemedText type="small" themeColor="textSecondary">Expenses</ThemedText>
          <ThemedText style={styles.totalAmount}>{formatMoney(summary.monthlyExpenses)}</ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">Monthly totals use transaction dates. Your Cash balance includes every month.</ThemedText>
    </ThemedView>
    <ThemedText type="smallBold" accessibilityRole="header">Recent transactions · {month}</ThemedText>
    {recent.length === 0 ? <ThemedView type="backgroundElement" style={styles.section}>
      <ThemedText>No transactions in this month.</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Choose another month to view history. Add Expense and Add Income start with today's Philippine date and time.</ThemedText>
    </ThemedView> : recent.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
    <ActionButton label="View all transactions" onPress={() => router.navigate('/transactions')} />
  </FinanceScreen>;
}
const styles = StyleSheet.create({
  balance: { padding: 24, borderRadius: 20, gap: 8 },
  balanceAmount: { fontSize: 40, lineHeight: 48, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { padding: 16, borderRadius: 16, gap: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  action: { flexGrow: 1, flexBasis: 140 },
  total: { flexGrow: 1, flexBasis: 100, gap: 4 },
  totalAmount: { fontSize: 22, lineHeight: 30, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
