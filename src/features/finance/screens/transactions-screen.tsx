import { useConfirmation } from '../components/confirmation';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useTheme } from '@/hooks/use-theme';
import { formatTransactionDateTime, readableReportingMonth, transactionDayHeading } from '../dates';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { FinanceScreen, TransactionRow, ActionButton, AddTransactionButton } from '../components/ui';
import { HomeMonthPicker } from '../components/home-month-picker';
import { filterTransactions } from '../reporting';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import type { Transaction } from '../types';

export default function TransactionsScreen() {
  const { accounts, transactions, month, refresh, busy, removeTransaction, showNotice } = useFinance();
  const theme = useTheme();
  const confirmation = useConfirmation();
  const params = useLocalSearchParams<{ accountId?: string }>();
  function setError(message: string) { if (message) showNotice(message, true); }
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'>('ALL');
  const [accountFilter, setAccountFilter] = useState<string | null>(typeof params.accountId === 'string' ? params.accountId : null);
  useEffect(() => {
    if (typeof params.accountId === 'string') { setAccountFilter(params.accountId); setFilter('ALL'); router.setParams({ accountId: undefined }); }
  }, [params.accountId]);
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
    confirmation.alert(transaction.exchange || transaction.exchangeParentId ? 'Delete linked exchange?' : 'Delete transaction?', transaction.exchange || transaction.exchangeParentId ? 'This deletes the exchange and all its linked fee, earnings, or payment records. Balances and reports will be recalculated.' : 'This removes the record and recalculates account balances and reports. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { deleting.current = false; } },
      { text: 'Delete', style: 'destructive', onPress: () => {
        void removeTransaction(transaction.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not delete.'))
          .finally(() => { deleting.current = false; });
      } },
    ], { rows: [{ label: 'Category', value: transaction.category }, { label: 'Amount', value: formatMoney(transaction.amount) }, { label: 'Account', value: accountLabel }, { label: 'Date', value: formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime) }] });
  }
  return <FinanceScreen title="Transaction history" centeredTitle scroll={false} floatingAction={<AddTransactionButton disabled={busy} />}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(['ALL', 'INCOME', 'EXPENSE', 'TRANSFER'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: filter === value ? theme.accentPressed : theme.infoSurface, opacity: pressed ? 0.5 : 1 })}>
          {filter === value ? <Ionicons accessible={false} name="checkmark" size={14} color={theme.onAccent} /> : null}
          <ThemedText type="small" numberOfLines={1} style={{ flexShrink: 1, fontSize: 11, color: filter === value ? theme.onAccent : theme.text }}>{value === 'ALL' ? 'All' : value === 'INCOME' ? 'Income' : value === 'TRANSFER' ? 'Transfers' : 'Expenses'}</ThemedText>
        </Pressable>)}
      </View>
      <HomeMonthPicker />
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6 }}>
      {[{ id: null, name: 'All accounts', archived: false }, ...accounts].map((account) => <Pressable key={account.id ?? 'all-accounts'} accessibilityRole="button" accessibilityLabel={account.name + (account.archived ? ', archived' : '')} accessibilityState={{ selected: accountFilter === account.id }} onPress={() => setAccountFilter(account.id)}
        style={{ minHeight: 44, maxWidth: 170, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', backgroundColor: accountFilter === account.id ? theme.backgroundSelected : theme.backgroundElement, borderWidth: 1, borderColor: accountFilter === account.id ? theme.accent : theme.border }}>
        {accountFilter === account.id ? <Ionicons accessible={false} name="checkmark" size={14} color={theme.accent} /> : null}
        <ThemedText type="small" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, fontSize: 12 }}>{account.name}{account.archived ? ' | Archived' : ''}</ThemedText>
      </Pressable>)}
    </ScrollView>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 }}>
      <Ionicons name="refresh-outline" size={16} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>{busy ? 'Refreshing...' : 'Pull down to refresh'}</ThemedText>
    </View>

    {accountFilter !== null && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <ThemedText type="small" style={{ flex: 1 }}>Account: {accounts.find((account) => account.id === accountFilter)?.name ?? 'Unavailable account'}</ThemedText>
      <ActionButton compact label="Reset account" onPress={() => setAccountFilter(null)} />
    </View>}
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
      contentContainerStyle={{ paddingBottom: 80, flexGrow: 1 }} ListEmptyComponent={<View style={{ gap: 12, paddingVertical: 16 }}>
        <ThemedText themeColor="textSecondary">No {filter === 'ALL' ? 'transactions' : filter === 'INCOME' ? 'income records' : filter === 'TRANSFER' ? 'transfers' : 'expenses'} in {readableReportingMonth(month)}{accountFilter ? ' for ' + (accounts.find((account) => account.id === accountFilter)?.name ?? 'this account') : ''}.</ThemedText>
        {(accountFilter !== null || filter !== 'ALL') && <ActionButton label="Clear filters" onPress={() => { setAccountFilter(null); setFilter('ALL'); }} />}
      </View>} />
  </FinanceScreen>;
}