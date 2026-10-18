import { useAmountVisibility } from '@/hooks/amount-visibility';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { dashboardSpending } from '../dashboard';
import { readableTransactionDate } from '../dates';

export function SpendingTrend({ days, period }: { days: ReturnType<typeof dashboardSpending>; period: string }) {
  const theme = useTheme();
  const { formatAmount: formatMoney } = useAmountVisibility();
  const [selectedDate, setSelectedDate] = useState('');
  const maximum = Math.max(0, ...days.map(day => day.expenses));
  const dateLabel = (date?: string) => date ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z')) : '';
  const selected = days.find(day => day.date === selectedDate);
  const point = (index: number, amount: number) => ({ x: 10 + index / Math.max(1, days.length - 1) * 280, y: 100 - amount / Math.max(1, maximum) * 85 });
  return <View style={{ backgroundColor: theme.backgroundElement, borderRadius: 20, padding: 14, gap: 10 }}>
    <ThemedText type="smallBold" accessibilityRole="header">Spending trend</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">{period === 'day' ? 'Last 7 days' : period === 'week' ? 'This week' : 'This month'}</ThemedText>
    {maximum ? <>
      <ThemedText type="small">Highest day: {formatMoney(maximum, true)}</ThemedText>
      <Svg width="100%" height={120} viewBox="0 0 300 110" accessibilityLabel="Daily expenses. Tap a point to see its amount.">
        <Line x1={10} x2={290} y1={100} y2={100} stroke={theme.border} />
        <Polyline points={days.map((day, index) => { const p = point(index, day.expenses); return p.x + ',' + p.y; }).join(' ')} fill="none" stroke={theme.accent} strokeWidth={2.5} />
        {days.map((day, index) => { const p = point(index, day.expenses); return <Circle key={day.date} cx={p.x} cy={p.y} r={selectedDate === day.date ? 5 : 3} fill={theme.accent} onPress={() => setSelectedDate(day.date)} accessibilityLabel={readableTransactionDate(day.date) + ': ' + formatMoney(day.expenses, true)} />; })}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10, flex: 1 }}>{dateLabel(days[0]?.date)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10 }}>{dateLabel(days.at(-1)?.date)}</ThemedText>
      </View>
      <ThemedText type="small" accessibilityLiveRegion="polite">{selected ? readableTransactionDate(selected.date) + ': ' + formatMoney(selected.expenses, true) : 'Tap a point to see daily spending.'}</ThemedText>
    </> : <ThemedText type="small" themeColor="textSecondary">No expenses recorded for this period.</ThemedText>}
  </View>;
}

export function IncomeExpenseChart({ income, expenses }: { income: number; expenses: number }) {
  const theme = useTheme();
  const { formatAmount: formatMoney } = useAmountVisibility();
  const maximum = Math.max(1, income, expenses);
  return <View style={{ backgroundColor: theme.backgroundElement, borderRadius: 20, padding: 14, gap: 12 }}>
    <ThemedText type="smallBold" accessibilityRole="header">Income vs. expenses</ThemedText>
    {[{ label: 'Income', amount: income, color: theme.income }, { label: 'Expenses', amount: expenses, color: theme.expense }].map(row => <View key={row.label} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><ThemedText type="small">{row.label}</ThemedText><ThemedText type="smallBold">{formatMoney(row.amount, true)}</ThemedText></View>
      <View accessible accessibilityLabel={row.label + ': ' + formatMoney(row.amount, true)} style={{ height: 14, borderRadius: 7, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
        <View style={{ height: 14, borderRadius: 7, backgroundColor: row.color, width: `${row.amount / maximum * 100}%` }} />
      </View>
    </View>)}
    <ThemedText type="small" themeColor="textSecondary">{!income && !expenses ? 'No income or expenses recorded for this period.' : income === expenses ? 'Recorded income and expenses are equal.' : formatMoney(Math.abs(income - expenses), true) + (income > expenses ? ' more income than expenses.' : ' more expenses than income.')}</ThemedText>
  </View>;
}
