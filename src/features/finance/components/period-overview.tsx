import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { dashboardReport, dashboardSpending, type DashboardPeriod } from '../dashboard';
import { philippineDateTime, readableTransactionDate } from '../dates';
import { formatMoney } from '../money';
import { useFinance } from '../provider';

export function PeriodOverview({ now }: { now: Date }) {
  const { transactions } = useFinance();
  const month = philippineDateTime(now).transactionDate.slice(0, 7);
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const [period, setPeriod] = useState<DashboardPeriod>('day');
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const report = dashboardReport(transactions, period, month, now);
  const days = dashboardSpending(transactions, 'week', month, now);
  const selected = days.find((day) => day.date === selectedDate);
  const hasExpenses = days.some((day) => day.expenses > 0);
  const slot = chartWidth / days.length;
  const barWidth = slot * 0.55;
  // Only chart geometry uses pesos; stored amounts and displayed totals remain exact centavos.
  const data = days.map((day) => ({ value: day.expenses / 100, frontColor: day.isToday ? theme.accent : theme.expense, onPress: () => setSelectedDate(day.date) }));
  const maximum = Math.max(1, ...days.map((day) => day.expenses / 100));
  function choosePeriod(value: DashboardPeriod) { setPeriod(value); }
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
    <View style={{ flexGrow: 1, flexBasis: fontScale > 1.3 ? '100%' : 130, minWidth: 120, padding: 10, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 6 }}>
      <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">THIS WEEK</ThemedText>
      <View onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)} style={{ minHeight: 100 }}>
        {chartWidth > 0 ? <View accessible={false} style={{ overflow: 'hidden' }}><BarChart key={days[0].date + chartWidth} data={data} width={chartWidth} height={80} maxValue={maximum} barWidth={barWidth} spacing={slot - barWidth} initialSpacing={(slot - barWidth) / 2} endSpacing={0} barBorderRadius={3} minHeight={2} hideRules hideYAxisText yAxisThickness={0} xAxisThickness={0} yAxisLabelWidth={0} disableScroll xAxisLabelsHeight={0} /></View> : null}
        <View style={{ flexDirection: 'row', height: 16 }}>{days.map((day) => <ThemedText key={day.date} type="small" style={{ flex: 1, textAlign: 'center', fontSize: 10, lineHeight: 14, color: day.isToday ? theme.accent : theme.textSecondary, fontWeight: day.isToday ? '700' : '400' }}>{day.label}</ThemedText>)}</View>
      </View>
      <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">{hasExpenses ? 'Expenses / tap a bar' : 'No expenses recorded'}</ThemedText>
      {selected ? <ThemedText accessibilityLiveRegion="polite" type="small" style={{ fontSize: 11, lineHeight: 16 }}>{new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(selected.date + 'T12:00:00Z'))}, {readableTransactionDate(selected.date)}: {formatMoney(selected.expenses)}</ThemedText> : null}
    </View>
    <View style={{ flexGrow: 1, flexBasis: 130, minWidth: 120, padding: 10, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 7 }}>
      <ThemedText type="smallBold" style={{ fontSize: 13, lineHeight: 18 }}>{period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</ThemedText>
      {[{ label: 'Income', amount: report.income, color: theme.income, icon: 'trending-up' }, { label: 'Expenses', amount: report.expenses, color: theme.expense, icon: 'trending-down' }].map((item) => <View key={item.label} style={{ gap: 1 }}>
        <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">{item.label}</ThemedText>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Ionicons name={item.icon as 'trending-up' | 'trending-down'} size={14} color={item.color} /><ThemedText numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', color: item.color, fontVariant: ['tabular-nums'] }}>{formatMoney(item.amount)}</ThemedText></View>
      </View>)}
      <View style={{ flexDirection: 'row', backgroundColor: theme.incomeSurface, borderRadius: 20, marginTop: 2 }}>
        {(['day', 'week', 'month'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value + ' report'} accessibilityState={{ selected: period === value }} onPress={() => choosePeriod(value)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: period === value ? theme.accent : 'transparent' }}>
          <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: period === value ? theme.onAccent : theme.textSecondary }}>{value === 'day' ? 'Day' : value === 'week' ? 'Week' : 'Month'}</ThemedText>
        </Pressable>)}
      </View>
    </View>
  </View>;
}
