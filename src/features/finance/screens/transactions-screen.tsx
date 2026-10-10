import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useTheme } from '@/hooks/use-theme';
import { formatTransactionDateTime, readableReportingMonth, transactionDayHeading } from '../dates';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, SectionList, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { FinanceScreen, TransactionRow } from '../components/ui';
import { HomeMonthPicker } from '../components/home-month-picker';
import { filterTransactions } from '../reporting';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import type { Transaction } from '../types';

export default function TransactionsScreen() {
  const { accounts, transactions, month, refresh, busy, removeTransaction } = useFinance();
  const theme = useTheme();
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'>('ALL');
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const visible = filterTransactions(transactions, month, filter).filter((row) => accountFilter === null || (row.accountId === accountFilter || row.destinationAccountId === accountFilter));
  const groups = new Map<string, Transaction[]>();
  for (const transaction of visible) {
    const group = groups.get(transaction.transactionDate);
    if (group) group.push(transaction);
    else groups.set(transaction.transactionDate, [transaction]);
  }
  const sections = [...groups].map(([date, data]) => ({ key: date, date, data }));
  const deleting = useRef(false);
  function confirmDelete(transaction: Transaction) {
    if (busy || deleting.current) return;
    deleting.current = true; setError('');
    const accountName = accounts.find((account) => account.id === transaction.accountId)?.name ?? '';
    const accountLabel = transaction.type === 'TRANSFER' ? accountName + ' to ' + (accounts.find((account) => account.id === transaction.destinationAccountId)?.name ?? '') : accountName;
    Alert.alert('Delete transaction?', accountLabel + '\n' + `${transaction.category} · ${formatMoney(transaction.amount)}\n${formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime)}`, [
      { text: 'Cancel', style: 'cancel', onPress: () => { deleting.current = false; } },
      { text: 'Delete', style: 'destructive', onPress: () => {
        void removeTransaction(transaction.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not delete.'))
          .finally(() => { deleting.current = false; });
      } },
    ], { cancelable: false });
  }
  return <FinanceScreen title="Transactions" centeredTitle scroll={false} floatingAction={
    <Pressable accessibilityRole="button" accessibilityLabel="Add transaction" accessibilityState={{ disabled: busy }} disabled={busy}
      onPress={() => router.push('/transaction')} style={({ pressed }) => ({ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, elevation: 4, opacity: busy || pressed ? 0.5 : 1 })}>
      <Ionicons name="add" size={30} color={theme.onAccent} />
    </Pressable>}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['ALL', 'INCOME', 'EXPENSE', 'TRANSFER'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: filter === value ? theme.accent : theme.expenseSurface, opacity: pressed ? 0.5 : 1 })}>
          <ThemedText type="small" style={{ fontSize: 12, color: filter === value ? theme.onAccent : theme.text }}>{value === 'ALL' ? 'All' : value === 'INCOME' ? 'Income' : value === 'TRANSFER' ? 'Transfers' : 'Expenses'}</ThemedText>
        </Pressable>)}
      </View>
      <HomeMonthPicker />
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6 }}>
      {[{ id: null, name: 'All accounts', archived: false }, ...accounts].map((account) => <Pressable key={account.id ?? 'all-accounts'} accessibilityRole="button" accessibilityLabel={account.name + (account.archived ? ', archived' : '')} accessibilityState={{ selected: accountFilter === account.id }} onPress={() => setAccountFilter(account.id)}
        style={{ minHeight: 44, maxWidth: 170, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: accountFilter === account.id ? theme.backgroundSelected : theme.backgroundElement, borderWidth: 1, borderColor: accountFilter === account.id ? theme.accent : theme.border }}>
        <ThemedText type="small" numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 12 }}>{account.name}{account.archived ? ' · Archived' : ''}</ThemedText>
      </Pressable>)}
    </ScrollView>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: theme.expenseSurface }}>
      <Ionicons name="refresh-outline" size={20} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{busy ? 'Refreshing…' : 'Pull down to refresh'}</ThemedText>
    </View>
    {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
    <SectionList style={{ flex: 1 }} overScrollMode="never" sections={sections} keyExtractor={(item) => item.id} stickySectionHeadersEnabled={false}
      refreshing={busy} onRefresh={() => { void refresh(); }}
      renderSectionHeader={({ section }) => <View style={{ backgroundColor: theme.backgroundElement, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 }}>
        <ThemedText type="smallBold" accessibilityRole="header" style={{ fontSize: 12, lineHeight: 18 }}>{transactionDayHeading(section.date)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 18 }}>{section.data.length} {section.data.length === 1 ? 'transaction' : 'transactions'}</ThemedText>
      </View>}
      renderItem={({ item }) => <TransactionRow transaction={item} accountName={accounts.find((account) => account.id === item.accountId)?.name ?? 'Unknown account'} destinationName={accounts.find((account) => account.id === item.destinationAccountId)?.name} disabled={busy}
        onEdit={() => { if (!deleting.current) router.push({ pathname: item.type === 'ADJUSTMENT' ? '/account' : '/transaction', params: { id: item.type === 'ADJUSTMENT' ? item.accountId : item.id } }); }}
        onDelete={() => confirmDelete(item)} />}
      ItemSeparatorComponent={() => <View style={{ backgroundColor: theme.backgroundElement, paddingHorizontal: 12 }}><View style={{ height: 1, backgroundColor: theme.border }} /></View>}
      renderSectionFooter={() => <View style={{ paddingBottom: 10 }}><View style={{ height: 8, backgroundColor: theme.backgroundElement, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }} /></View>}
      contentContainerStyle={{ paddingBottom: 80, flexGrow: 1 }} ListEmptyComponent={<ThemedText themeColor="textSecondary">No {filter === 'ALL' ? 'transactions' : filter === 'INCOME' ? 'income records' : filter === 'TRANSFER' ? 'transfers' : 'expenses'} in {readableReportingMonth(month)}.</ThemedText>} />
  </FinanceScreen>;
}