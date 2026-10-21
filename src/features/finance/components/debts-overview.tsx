import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import { useFinance } from '../provider';
import { debtProgress, debtTotals } from '../debts';
import { philippineDateTime, readableTransactionDate } from '../dates';
import { ActionButton } from './ui';

export function DebtsOverview() {
  const { debts, debtPayments, busy } = useFinance();
  const theme = useTheme();
  const { formatAmount } = useAmountVisibility();
  const [showSettled, setShowSettled] = useState(false);
  const totals = debtTotals(debts, debtPayments);
  const today = philippineDateTime().transactionDate;
  const rows = debts.map(debt => ({ debt, ...debtProgress(debt,debtPayments) }));
  return <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="people-outline" size={18} color={theme.accent} /><ThemedText type="smallBold" style={{ flex: 1 }}>Debts</ThemedText>
      <ActionButton compact label="Add debt" disabled={busy} onPress={() => router.push('/debt')} />
    </View>
    <ThemedText type="small" themeColor="textSecondary">Money owed to you is not available until received.</ThemedText>
    {(['owe', 'owed'] as const).map(kind => {
      const group = rows.filter(row => row.debt.kind === kind && (showSettled || !row.settled));
      return <View key={kind} accessibilityLabel={kind === 'owe' ? 'I owe debts' : 'Debts owed to me'} style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText type="smallBold" style={{ flex: 1 }}>{kind === 'owe' ? 'I owe' : 'Owed to me'}</ThemedText>
          <ThemedText type="smallBold">{formatAmount(kind === 'owe' ? totals.owe : totals.owed)}</ThemedText>
        </View>
        {!group.length ? <ThemedText type="small" themeColor="textSecondary">{showSettled ? 'No debts recorded.' : 'No outstanding debts.'}</ThemedText> : null}
        {group.map(({ debt, remaining, settled }) => <Pressable key={debt.id} accessibilityRole="button" accessibilityLabel={'View debt with '+debt.name} disabled={busy} onPress={() => router.push({ pathname: '/debt', params: { id: debt.id } })}
          style={({ pressed }) => ({ padding: 12, borderRadius: 12, backgroundColor: theme.background, gap: 4, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ flexDirection: 'row', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{debt.name}</ThemedText><ThemedText type="smallBold">{formatAmount(remaining)}</ThemedText><Ionicons name="chevron-forward" size={14} color={theme.textSecondary} /></View>
          <ThemedText type="small" themeColor="textSecondary">{settled ? 'Settled' : 'Outstanding'}{!settled && debt.dueDate ? ' | '+(debt.dueDate < today ? 'Overdue: ' : 'Due: ')+readableTransactionDate(debt.dueDate) : ''}</ThemedText>
        </Pressable>)}
      </View>;
    })}
    {rows.some(row => row.settled) ? <ActionButton compact label={showSettled ? 'Hide settled debts' : 'Show settled debts'} onPress={() => setShowSettled(value => !value)} /> : null}
  </View>;
}
