import { HIDDEN_AMOUNT, useAmountVisibility } from '@/hooks/amount-visibility';
import { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dashboardCategories } from '../dashboard';
import { formatTransactionDateTime } from '../dates';
import { spendingBlocks } from '../spending-blocks';
import type { Transaction } from '../types';
import { categoryVisual } from './category-visual';
import { ActionButton } from './ui';

function blockTextColor(color: string) {
  const channels = color.slice(1).match(/../g)!.map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? '#000000' : '#FFFFFF';
}

export function CategorySpending({ transactions, start, end, period }: { transactions: readonly Transaction[]; start: string; end: string; period: string }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const { fontScale } = useWindowDimensions();
  const { hidden: amountsHidden, formatAmount: formatMoney, conceal } = useAmountVisibility();
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<{ category: string; start: string; end: string } | null>(null);
  const [recordLimit, setRecordLimit] = useState(10);
  const { total, rows } = useMemo(() => dashboardCategories(transactions, start, end), [transactions, start, end]);
  const blocks = useMemo(() => spendingBlocks(rows, width, 184), [rows, width]);
  const selected = selection?.start === start && selection.end === end ? rows.find(row => row.category === selection.category) : undefined;
  const records = useMemo(() => selected ? transactions.filter(row => row.type === 'EXPENSE' && row.category === selected.category && row.transactionDate >= start && row.transactionDate <= end)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.transactionTime.localeCompare(a.transactionTime)) : [], [transactions, selected, start, end]);
  function choose(category: string) {
    setSelection(selected?.category === category ? null : { category, start, end });
    setRecordLimit(10);
    if (rows.findIndex(row => row.category === category) >= 5) setExpanded(true);
  }
  function share(amount: number) { return amountsHidden ? HIDDEN_AMOUNT : (amount / total * 100).toFixed(1) + '%'; }
  return <View style={{ padding: 14, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ThemedText type="smallBold" style={{ flex: 1 }}>Spending by category</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</ThemedText>
    </View>
    {total ? <>
      <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: 184, borderRadius: 12, overflow: 'hidden' }}>
        {blocks.map(block => {
          const color = categoryVisual(block.category, false, dark).color;
          const readable = block.width >= 76 * fontScale && block.height >= 52 * fontScale;
          return <Pressable key={block.category} accessibilityRole="button" accessibilityLabel={block.category + ', ' + formatMoney(block.amount, true) + ', ' + share(block.amount) + ' of spending'} accessibilityState={{ selected: selected?.category === block.category, expanded: selected?.category === block.category }}
            onPress={() => choose(block.category)} style={({ pressed }) => ({ position: 'absolute', left: block.x, top: block.y, width: block.width, height: block.height, padding: readable ? 8 : 0, justifyContent: 'center', overflow: 'hidden', backgroundColor: color, opacity: pressed ? 0.7 : 1, borderWidth: selected?.category === block.category ? 2 : 1, borderColor: selected?.category === block.category ? theme.text : theme.backgroundElement })}>
            {readable ? <><ThemedText type="smallBold" numberOfLines={2} style={{ color: blockTextColor(color), fontSize: 11, lineHeight: 15 }}>{block.category}</ThemedText><ThemedText type="small" numberOfLines={1} style={{ color: blockTextColor(color), fontSize: 11, lineHeight: 15 }}>{formatMoney(block.amount, true)}</ThemedText></> : null}
          </Pressable>;
        })}
      </View>
      <View>
        {(expanded ? rows : rows.slice(0, 5)).map(row => <View key={row.category}>
          <Pressable accessibilityRole="button" accessibilityLabel={row.category + ', ' + formatMoney(row.amount, true) + ', ' + share(row.amount) + ' of spending'} accessibilityState={{ selected: selected?.category === row.category, expanded: selected?.category === row.category }} onPress={() => choose(row.category)}
            style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: selected?.category === row.category ? theme.backgroundSelected : 'transparent', opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: categoryVisual(row.category, false, dark).color }} />
            <ThemedText type="small" style={{ flex: 1 }}>{row.category}</ThemedText>
            <View style={{ alignItems: 'flex-end', flexShrink: 1 }}><ThemedText type="smallBold">{formatMoney(row.amount, true)}</ThemedText><ThemedText type="small" themeColor="textSecondary">{share(row.amount)}</ThemedText></View>
          </Pressable>
          {selected?.category === row.category ? <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: theme.background }}>
            {records.slice(0, recordLimit).map(record => <Pressable key={record.id} accessibilityRole="button" accessibilityLabel={'View ' + record.category + ', ' + conceal(record.notes?.trim() || record.category) + ', ' + formatMoney(record.amount, true) + ', ' + formatTransactionDateTime(record.transactionDate, record.transactionTime)} onPress={() => router.push({ pathname: '/transaction', params: { id: record.exchangeParentId ?? record.id } })}
              style={({ pressed }) => ({ minHeight: 44, paddingVertical: 8, gap: 2, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <ThemedText type="smallBold" numberOfLines={2} style={{ flex: 1 }}>{conceal(record.notes?.trim() || record.category)}</ThemedText>
                <ThemedText type="smallBold" style={{ flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatMoney(record.amount, true)}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{formatTransactionDateTime(record.transactionDate, record.transactionTime)}</ThemedText>
            </Pressable>)}
            {records.length > recordLimit ? <ActionButton compact label="Show more transactions" onPress={() => setRecordLimit(value => value + 10)} /> : null}
          </View> : null}
        </View>)}
      </View>
      {rows.length > 5 ? <ActionButton compact label={expanded ? 'Show less' : 'View all categories'} onPress={() => {
        setExpanded(value => !value);
        if (expanded && selected && rows.findIndex(row => row.category === selected.category) >= 5) setSelection(null);
      }} /> : null}
    </> : <ThemedText type="small" themeColor="textSecondary">No expenses recorded for this period.</ThemedText>}
  </View>;
}
