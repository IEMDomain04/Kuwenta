import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import { incomeCategory, CATEGORIES, type Transaction } from '../../domain/types';
import { formatTransactionDateTime } from '../../domain/dates';
import { incomeSources } from '../../reporting/income-sources';
import { ActionButton } from '../shared/ui';

const colors = ['#17658F','#087443','#6543A0','#0B6575','#855006','#9C3C2B','#527326','#965076','#374151'];
export function IncomeSources({ transactions, start, end, label }: { transactions: readonly Transaction[]; start: string; end: string; label: string }) {
  const theme = useTheme(); const dark = useColorScheme() === 'dark';
  const { hidden, formatAmount, conceal } = useAmountVisibility();
  const [selected, setSelected] = useState(''); const [limit, setLimit] = useState(10);
  const report = useMemo(() => incomeSources(transactions, start, end), [transactions,start,end]);
  const records = selected ? transactions.filter(row => row.type === 'INCOME' && row.transactionDate >= start && row.transactionDate <= end && incomeCategory(row.category) === selected).slice().sort((a,b)=> b.transactionDate.localeCompare(a.transactionDate) || b.transactionTime.localeCompare(a.transactionTime)) : [];
  return <View testID="income-sources" style={{ padding: 14, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><ThemedText type="smallBold">Income by source</ThemedText><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText></View>
    <ThemedText type="smallBold">Recorded income: {formatAmount(report.total, true)}</ThemedText>
    {report.rows.map(row => {
      const base = colors[Math.max(0, (CATEGORIES.INCOME as readonly string[]).indexOf(row.category)) % colors.length];
      const color = dark ? '#' + base.slice(1).match(/../g)!.map(channel=>Math.round(parseInt(channel,16)*0.5+127.5).toString(16).padStart(2,'0')).join('') : base;
      return <View key={row.category} style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={row.category + ', ' + formatAmount(row.amount)} accessibilityState={{ expanded: selected === row.category }} onPress={() => { setSelected(selected === row.category ? '' : row.category); setLimit(10); }} style={{ gap: 6, minHeight: 44, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 8 }}><ThemedText type="smallBold" style={{ flex: 1 }}>{row.category}</ThemedText><ThemedText type="smallBold">{formatAmount(row.amount,true)}</ThemedText></View>
          <View style={{ height: 10, borderRadius: 4, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}><View style={{ height: 10, backgroundColor: color, width: hidden ? '100%' : `${row.amount / Math.max(1,report.rows[0].amount)*100}%` }} /></View>
        </Pressable>
        {selected === row.category ? <View style={{ gap: 6 }}>
          {records.slice(0,limit).map(record=><Pressable key={record.id} accessibilityRole="button" accessibilityLabel={'View income, '+conceal(record.notes?.trim() || row.category)+', '+formatAmount(record.amount)} onPress={()=>router.push({pathname:'/transaction',params:{id:record.exchangeParentId ?? record.id}})} style={{ minHeight: 44, gap: 3, paddingVertical: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}><ThemedText type="small" style={{ flex: 1 }}>{conceal(record.notes?.trim() || row.category)}</ThemedText><ThemedText type="smallBold">{formatAmount(record.amount,true)}</ThemedText></View>
            <ThemedText type="small" themeColor="textSecondary">{formatTransactionDateTime(record.transactionDate,record.transactionTime)}</ThemedText>
          </Pressable>)}
          {records.length > limit ? <ActionButton compact label="Show more transactions" onPress={()=>setLimit(value=>value+10)} /> : null}
        </View> : null}
      </View>;
    })}
    {!report.rows.length ? <ThemedText type="small" themeColor="textSecondary">No income recorded for this period.</ThemedText> : null}
  </View>;
}
