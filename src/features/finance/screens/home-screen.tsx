import { BudgetOverview } from '../components/budget-overview';
import { AccountsOverview } from '../components/accounts-overview';
import { SavingsOverview } from '../components/savings-overview';
import { useMemo } from 'react';
import { calculateCurrentMoney } from '../calculations';
import { formatTransactionDateTime, readableReportingMonth } from '../dates';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { ActionButton, FinanceScreen, AddTransactionButton } from '../components/ui';
import { CategoryIcon, SpendingDonut, categoryVisual, svgSource } from '../components/category-visual';
import { HomeMonthPicker } from '../components/home-month-picker';
import { filterTransactions, spendingByCategory } from '../reporting';
import { formatMoney } from '../money';
import { useFinance } from '../provider';

export default function HomeScreen() {
  const { accounts, transactions, summary, month, busy } = useFinance();
  const theme = useTheme();
  const currentMoney = useMemo(() => {
    try { return { values: calculateCurrentMoney(accounts, transactions), error: '' }; }
    catch (cause) { return { values: null, error: cause instanceof Error ? cause.message : 'Could not calculate current balances.' }; }
  }, [accounts, transactions]);
  const recent = filterTransactions(transactions, month).slice(0, 5);
  const spending = spendingByCategory(transactions, month);
  return <FinanceScreen title="Kuwenta" headerAccessory={<HomeMonthPicker />} floatingAction={<AddTransactionButton disabled={busy} />}>

    <View style={[styles.balance, { backgroundColor: '#096A7C', overflow: 'hidden' }]}>
      <Image accessible={false} source={svgSource('<defs><linearGradient id="g"><stop stop-color="#087C91"/><stop offset="1" stop-color="' + theme.balanceEnd + '"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/><path d="M170 200Q250 70 400 145V200z" fill="#FFFFFF" opacity=".08"/>', '0 0 400 200')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="wallet" size={22} color="#FFFFFF" /><ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Available Money</ThemedText></View>
      <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} style={[styles.balanceAmount, { color: '#FFFFFF' }]}>{currentMoney.values ? formatMoney(currentMoney.values.availableMoney) : '—'}</ThemedText>
      <ThemedText type="small" style={{ color: '#FFFFFF' }}>Included accounts · All months · PHP</ThemedText>
      {currentMoney.values?.hasNegativeAccount && <ThemedText accessibilityRole="alert" style={{ color: '#FFFFFF' }}>One or more account balances are negative. Open Accounts to review them.</ThemedText>}
    </View>
    {currentMoney.error ? <ThemedText accessibilityRole="alert">{currentMoney.error}</ThemedText> : null}
    <ThemedView type="backgroundElement" style={styles.panel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <ThemedText type="smallBold">Total Money</ThemedText>
        <ThemedText style={styles.totalAmount}>{currentMoney.values ? formatMoney(currentMoney.values.totalMoney) : '—'}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">All accounts · All months · PHP</ThemedText>
      {accounts.some((account) => account.archived) && <ThemedText type="small" themeColor="textSecondary">Archived account balances remain included.</ThemedText>}
    </ThemedView>
    <ActionButton compact label="Quick Entry" disabled={busy} onPress={() => router.push({ pathname: '/transaction', params: { quick: '1' } })} />
    <AccountsOverview compact />
    <View style={styles.section}>
      <ThemedText type="smallBold" accessibilityRole="header">Monthly Overview · All accounts</ThemedText>

      <View style={styles.row}>
        <ThemedView type="backgroundElement" style={[styles.total, { borderColor: theme.border, backgroundColor: theme.incomeSurface, overflow: 'hidden' }]}>
          <Image accessible={false} source={svgSource('<defs><linearGradient id="i" x2="0" y2="1"><stop stop-color="' + theme.incomeSurface + '"/><stop offset="1" stop-color="' + theme.incomeEnd + '"/></linearGradient></defs><rect width="200" height="120" fill="url(#i)"/>', '0 0 200 120')} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.categoryRow}><Ionicons name="arrow-up-circle" size={28} color={theme.income} /><ThemedText type="smallBold">Income</ThemedText></View>
          <ThemedText style={styles.totalAmount} themeColor="income">{formatMoney(summary.monthlyIncome)}</ThemedText>
        </ThemedView>
        <ThemedView type="backgroundElement" style={[styles.total, { borderColor: theme.border, backgroundColor: theme.expenseSurface, overflow: 'hidden' }]}>
          <Image accessible={false} source={svgSource('<defs><linearGradient id="e" x2="0" y2="1"><stop stop-color="' + theme.expenseSurface + '"/><stop offset="1" stop-color="' + theme.expenseEnd + '"/></linearGradient></defs><rect width="200" height="120" fill="url(#e)"/>', '0 0 200 120')} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.categoryRow}><Ionicons name="arrow-down-circle" size={28} color={theme.expense} /><ThemedText type="smallBold">Expenses</ThemedText></View>
          <ThemedText style={styles.totalAmount} themeColor="expense">{formatMoney(summary.monthlyExpenses)}</ThemedText>
        </ThemedView>
      </View>

    </View>
    <ThemedView type="backgroundElement" style={[styles.panel, { padding: 12, gap: 8 }]}>
      <ThemedText type="smallBold" style={{ fontSize: 14, lineHeight: 18 }} accessibilityRole="header">Spending Breakdown · {readableReportingMonth(month)}</ThemedText>
      {spending.length === 0 ? <ThemedText themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 15 }}>No expenses recorded for this month.</ThemedText>
         : <><View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}><View style={{ gap: 4, alignItems: 'center' }}>
          <SpendingDonut categories={spending} total={summary.monthlyExpenses} />

        </View><View style={{ flex: 1, minWidth: 165, gap: 8 }}>{spending.map(({ category, amount }) => <View key={category} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
            <CategoryIcon category={category} compact />
            <ThemedText type="smallBold" style={{ flex: 1, minWidth: 45, fontSize: 11, lineHeight: 15 }}>{category}</ThemedText>
            <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">{Math.round(amount / summary.monthlyExpenses * 100)}%</ThemedText><ThemedText type="smallBold" style={[styles.figures, { fontSize: 11, lineHeight: 15 }]}>{formatMoney(amount)}</ThemedText>
          </View>
          <View accessible={false} style={[styles.track, { height: 5 }, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.bar, { height: 5 }, { backgroundColor: categoryVisual(category).color, width: `${amount / summary.monthlyExpenses * 100}%` }]} />
          </View>
        </View>)}</View></View><ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">Percentages are rounded; amounts are exact.</ThemedText></>}
    </ThemedView>
    <BudgetOverview />
    <SavingsOverview compact />
    <ThemedView type="backgroundElement" style={styles.panel}>
    <ThemedText type="smallBold" accessibilityRole="header">Recent transactions · {readableReportingMonth(month)}</ThemedText>
    {recent.length === 0 ? <ThemedText themeColor="textSecondary">No transactions in this month. Choose another month to view history, or add a record.</ThemedText>
      : recent.map((transaction, index) => <View key={transaction.id} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: index ? 12 : 0, borderTopWidth: index ? 1 : 0, borderColor: theme.border }}>
        <CategoryIcon category={transaction.category} income={transaction.type === 'INCOME'} />
        <View style={{ flex: 1, minWidth: 130, gap: 2 }}>
          <ThemedText type="smallBold" numberOfLines={2}>{transaction.notes || transaction.category}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{transaction.type === "TRANSFER" ? (accounts.find((account) => account.id === transaction.accountId)?.name + " to " + accounts.find((account) => account.id === transaction.destinationAccountId)?.name) : transaction.category + " · " + accounts.find((account) => account.id === transaction.accountId)?.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime)}</ThemedText>
        </View>
        <ThemedText type="smallBold" style={[styles.figures, transaction.type === 'INCOME' && { color: theme.income }]}>{transaction.type === 'TRANSFER' ? '' : (transaction.type === 'INCOME' || transaction.type === 'ADJUSTMENT' && transaction.adjustmentDirection === 'increase') ? '+' : '−'}{formatMoney(transaction.amount)}</ThemedText>
      </View>)}
    <ActionButton label="View all transactions" onPress={() => router.navigate('/transactions')} />
  </ThemedView>
</FinanceScreen>;
}
const styles = StyleSheet.create({
  balance: { padding: 18, borderRadius: 20, gap: 8 },
  balanceAmount: { fontSize: 38, lineHeight: 48, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { gap: 12 },
  panel: { padding: 14, borderRadius: 18, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fab: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  total: { flexGrow: 1, flexBasis: 140, gap: 8, padding: 16, borderRadius: 16, borderWidth: 1 },
  totalAmount: { fontSize: 22, lineHeight: 30, fontWeight: '600', fontVariant: ['tabular-nums'] },
  categoryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  figures: { fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
});