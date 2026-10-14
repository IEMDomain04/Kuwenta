import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { dashboardCategories } from '../dashboard';
import { formatMoney } from '../money';
import type { Transaction } from '../types';
import { ActionButton } from './ui';

export function CategorySpending({ transactions, start, end, period }: { transactions: readonly Transaction[]; start: string; end: string; period: string }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { total, rows } = useMemo(() => dashboardCategories(transactions, start, end), [transactions, start, end]);
  const colors = [theme.accent, theme.budget, theme.secondary, theme.warning, theme.expense, theme.textSecondary];
  const slices = rows.slice(0, 5);
  if (rows.length > 5) slices.push({ category: 'Other categories', amount: rows.slice(5).reduce((sum, row) => sum + row.amount, 0) });
  let offset = 0;
  const circumference = 2 * Math.PI * 40;
  return <View style={{ padding: 14, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ThemedText type="smallBold" style={{ flex: 1 }}>Spending by category</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</ThemedText>
    </View>
    {total ? <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <View accessible accessibilityLabel={'Total expenses: ' + formatMoney(total, true)} style={{ width: 112, height: 112 }}>
          <Svg width={112} height={112} viewBox="0 0 100 100" accessible={false}>
            {slices.map((slice, index) => {
              const length = slice.amount / total * circumference;
              const previous = offset; offset += length;
              return <Circle key={slice.category} cx={50} cy={50} r={40} fill="none" stroke={colors[index]} strokeWidth={14} strokeDasharray={[length, circumference - length]} strokeDashoffset={-previous} rotation={-90} origin="50,50" />;
            })}
          </Svg>
        </View>
        <View style={{ flex: 1, minWidth: 140, gap: 7 }}>
          {(expanded ? rows : slices).map((row, index) => <View key={row.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[Math.min(index, 5)] }} />
            <ThemedText type="small" numberOfLines={1} style={{ flex: 1, fontSize: 11 }}>{row.category}</ThemedText>
            <ThemedText type="small" style={{ fontSize: 11 }}>{formatMoney(row.amount, true)} / {(row.amount / total * 100).toFixed(1)}%</ThemedText>
          </View>)}
        </View>
      </View>
      <ThemedText type="smallBold">Total expenses: {formatMoney(total, true)}</ThemedText>
      {rows.length > 5 ? <ActionButton compact label={expanded ? 'Show less' : 'View all categories'} onPress={() => setExpanded(value => !value)} /> : null}
    </> : <ThemedText type="small" themeColor="textSecondary">No expenses recorded for this period.</ThemedText>}
  </View>;
}
