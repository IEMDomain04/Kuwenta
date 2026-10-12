import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
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
  const [selectedDate, setSelectedDate] = useState('');
  const report = dashboardReport(transactions, period, month, now);
  const days = dashboardSpending(transactions, 'week', month, now);
  const selected = days.find((day) => day.date === selectedDate);
  const hasExpenses = days.some((day) => day.expenses > 0);
  const spendingColors = [theme.background, '#14532D', '#15803D', '#22C55E', '#86EFAC'];
  function choosePeriod(value: DashboardPeriod) { setPeriod(value); }
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
    <View style={{ flexGrow: 1, flexBasis: fontScale > 1.3 ? '100%' : 130, minWidth: 120, padding: 10, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 6 }}>
      <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">THIS WEEK</ThemedText>
      <View style={{ flex: 1, justifyContent: 'center', gap: 8, minHeight: 100 }}>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {days.map((day) => {
            // Daily totals are stored in centavos; levels stay fixed across weeks.
            const level = day.expenses === 0 ? 0 : day.expenses < 15_000 ? 1 : day.expenses < 30_000 ? 2 : day.expenses < 50_000 ? 3 : 4;
            return <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={readableTransactionDate(day.date) + ', ' + formatMoney(day.expenses) + ' spent'} accessibilityState={{ selected: selectedDate === day.date }} onPress={() => setSelectedDate(day.date)} style={{ flex: 1, minHeight: 44, justifyContent: 'center', gap: 5 }}>
              <View style={{ width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: spendingColors[level], borderWidth: 1, borderColor: selectedDate === day.date ? theme.text : theme.border }} />
              <ThemedText type="small" numberOfLines={1} adjustsFontSizeToFit style={{ textAlign: 'center', fontSize: 9, lineHeight: 13, color: day.isToday ? theme.accent : theme.textSecondary, fontWeight: day.isToday ? '700' : '400' }}>{day.label}</ThemedText>
            </Pressable>;
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 3 }}>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 8, lineHeight: 12 }}>Less</ThemedText>
          {spendingColors.map((color, index) => <View key={index} style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, borderWidth: index === 0 ? 1 : 0, borderColor: theme.border }} />)}
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 8, lineHeight: 12 }}>More</ThemedText>
        </View>
      </View>
      <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">{hasExpenses ? 'Spending / tap a tile' : 'No expenses recorded'}</ThemedText>
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
