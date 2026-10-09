import { FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { FinanceScreen, TransactionRow } from '../components/ui';
import { useFinance } from '../provider';

export default function TransactionsScreen() {
  const { transactions, refresh, busy } = useFinance();
  return <FinanceScreen title="Transactions" scroll={false}>
    <ThemedText type="small" themeColor="textSecondary">Cash · Dates and times are Philippine time</ThemedText>
    <FlatList data={transactions} keyExtractor={(item) => item.id} refreshing={busy}
      onRefresh={() => { void refresh(); }} renderItem={({ item }) => <TransactionRow transaction={item} />}
      contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
      ListEmptyComponent={<ThemedText themeColor="textSecondary">No transactions yet.</ThemedText>} />
  </FinanceScreen>;
}
