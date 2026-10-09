import { useRef, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ActionButton, FinanceScreen, TransactionRow } from '../components/ui';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import type { Transaction } from '../types';

export default function TransactionsScreen() {
  const { transactions, refresh, busy, removeTransaction } = useFinance();
  const [error, setError] = useState('');
  const deleting = useRef(false);
  function confirmDelete(transaction: Transaction) {
    if (busy || deleting.current) return;
    deleting.current = true; setError('');
    Alert.alert('Delete transaction?', `${transaction.category} · ${formatMoney(transaction.amount)}\n${transaction.transactionDate} ${transaction.transactionTime} PH`, [
      { text: 'Cancel', style: 'cancel', onPress: () => { deleting.current = false; } },
      { text: 'Delete', style: 'destructive', onPress: () => {
        void removeTransaction(transaction.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not delete.'))
          .finally(() => { deleting.current = false; });
      } },
    ], { cancelable: false });
  }
  return <FinanceScreen title="Transactions" scroll={false}>
    <ActionButton label="Add transaction" disabled={busy} onPress={() => router.push('/transaction')} />
    <ThemedText type="small" themeColor="textSecondary">Cash · Dates and times are Philippine time</ThemedText>
    {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
    <FlatList data={transactions} keyExtractor={(item) => item.id} refreshing={busy} onRefresh={() => { void refresh(); }}
      renderItem={({ item }) => <View style={{ gap: 8 }}><TransactionRow transaction={item} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionButton label="Edit" disabled={busy} onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })} />
          <ActionButton label="Delete" disabled={busy} onPress={() => confirmDelete(item)} />
        </View></View>}
      contentContainerStyle={{ gap: 20, paddingBottom: 16 }} ListEmptyComponent={<ThemedText themeColor="textSecondary">No transactions yet. Add your first income or expense.</ThemedText>} />
  </FinanceScreen>;
}
