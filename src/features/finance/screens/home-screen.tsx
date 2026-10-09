import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton, FinanceScreen, TransactionRow } from '../components/ui';
import { formatMoney } from '../money';
import { useFinance } from '../provider';

export default function HomeScreen() {
  const { account, transactions, summary, month, busy } = useFinance();
  return <FinanceScreen title="Your money">
    <ThemedText themeColor="textSecondary">Kuwenta · PHP</ThemedText>
    <ThemedView type="backgroundElement" style={{ padding: 24, borderRadius: 16, gap: 8 }}>
      <ThemedText>{account.name} balance</ThemedText>
      <ThemedText type="subtitle">{formatMoney(summary.balance)}</ThemedText>
      {summary.hasNegativeBalance && <ThemedText accessibilityRole="alert">Your Cash balance is negative. Check whether any income or opening money is missing.</ThemedText>}
    </ThemedView>
    <ThemedText type="smallBold">This month · {month} (Philippine time)</ThemedText>
    <ThemedText>Income: {formatMoney(summary.monthlyIncome)}</ThemedText>
    <ThemedText>Expenses: {formatMoney(summary.monthlyExpenses)}</ThemedText>
    <ActionButton label="View transactions" onPress={() => router.navigate('/transactions')} />
    <ActionButton label="Set opening balance" disabled={busy} onPress={() => router.navigate('/settings')} />
    <ThemedText type="smallBold">Recent transactions</ThemedText>
    {transactions.length === 0 ? <ThemedText themeColor="textSecondary">No transactions yet.</ThemedText>
      : transactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}
  </FinanceScreen>;
}
