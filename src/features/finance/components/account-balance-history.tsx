import { useState } from 'react';
import { View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { weeklyRecordedBalances } from '../dashboard';
import { readableTransactionDate } from '../dates';
import { formatMoney } from '../money';
import { useFinance } from '../provider';

export function AccountBalanceHistory({ now }: { now: Date }) {
  const { accounts, transactions } = useFinance();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selectedDate, setSelectedDate] = useState('');
  const days = weeklyRecordedBalances(accounts, transactions, now);
  const selected = days.find((day) => day.date === selectedDate);
  const maximum = Math.max(1, ...days.map((day) => Math.abs(day.balance ?? 0) / 100));
  const negative = days.some((day) => day.balance !== null && day.balance < 0);
  const slot = width / days.length;
  return <View style={{ padding: 10, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 8 }}>
    <ThemedText type="smallBold" style={{ fontSize: 10, lineHeight: 14 }} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">Recorded balance</ThemedText>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? <View accessible={false} style={{ overflow: 'hidden' }}><BarChart data={days.map((day) => ({ value: (day.balance ?? 0) / 100, frontColor: day.balance === null ? 'transparent' : day.isToday ? theme.accent : theme.income, onPress: () => setSelectedDate(day.date) }))} width={width} height={70} maxValue={maximum} noOfSections={1} stepValue={maximum} noOfSectionsBelowXAxis={negative ? 1 : 0} negativeStepValue={maximum} barWidth={slot * 0.4} spacing={slot * 0.6} initialSpacing={slot * 0.3} endSpacing={0} hideRules hideYAxisText yAxisThickness={0} yAxisLabelWidth={0} xAxisThickness={negative ? 1 : 0} xAxisColor={theme.border} xAxisLabelsHeight={0} barBorderRadius={3} disableScroll /></View> : null}
      <View style={{ flexDirection: 'row' }}>{days.map((day) => <ThemedText key={day.date} type="small" style={{ flex: 1, fontSize: 10, textAlign: 'center', color: day.isToday ? theme.accent : theme.textSecondary }}>{day.label}</ThemedText>)}</View>
    </View>
    {selected ? <ThemedText type="small" accessibilityLiveRegion="polite">{readableTransactionDate(selected.date)}: {selected.balance === null ? 'Future day' : formatMoney(selected.balance)}</ThemedText> : null}
  </View>;
}
