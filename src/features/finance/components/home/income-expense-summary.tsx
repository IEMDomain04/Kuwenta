import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import { useTheme } from '@/hooks/use-theme';
import { readableTransactionDate } from '../../domain/dates';
import type { dailyCashFlow } from '../../reporting/daily-cash-flow';

type Props = { income: number; expenses: number; monthly: boolean; paired: boolean; showChart: boolean; label: string; today: string; days: ReturnType<typeof dailyCashFlow> };
export function IncomeExpenseSummary({ income, expenses, monthly, paired, showChart, label, today, days }: Props) {
  const theme = useTheme();
  const { formatAmount } = useAmountVisibility();
  const [selectedDate, setSelectedDate] = useState('');
  const selected = days.find(day => day.date === selectedDate && day.date <= today);
  const halfHeight = 46;
  const peak = Math.max(0, ...days.map(day => Math.max(day.income, day.expenses)));
  const maximum = Math.max(1, peak);
  const values = [{ label: 'Income', amount: income, color: theme.income }, { label: 'Expenses', amount: expenses, color: theme.expense }];
  return <View testID="income-expense-summary-card" style={{ flexGrow: paired ? 42 : 0, flexBasis: paired ? 0 : 'auto', flexShrink: paired ? 1 : 0, width: paired ? 'auto' : '100%', minWidth: 0, padding: 10, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 8, justifyContent: 'flex-start' }}>
    <ThemedText type="smallBold" style={{ fontSize: 13, lineHeight: 18 }}>{label}</ThemedText>
    <View testID="income-expense-summary-content" style={{ flexDirection: showChart ? 'row' : 'column', alignItems: 'stretch', gap: paired ? 8 : 12 }}>
      {showChart ? <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <View style={{ width: 42, height: halfHeight * 2, justifyContent: 'space-between' }}>{[peak,0,peak].map((amount,index)=><ThemedText key={index} type="small" numberOfLines={1} adjustsFontSizeToFit themeColor="textSecondary" style={{ fontSize: 9, lineHeight: 12 }}>{formatAmount(amount,true)}</ThemedText>)}</View>
        <View testID="income-expense-mirrored-chart" style={{ height: halfHeight * 2, flex: 1, flexDirection: 'row', gap: days.length > 10 ? 2 : 4 }}>
          {[1,halfHeight,halfHeight*2-1].map(top=><View key={top} testID="summary-chart-guide" pointerEvents="none" accessible={false} style={{ position: 'absolute', top, left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: theme.border }} />)}
          {days.map(day => <Pressable key={day.date} accessibilityRole="button" accessibilityState={{ selected: selected?.date === day.date, disabled: day.date > today }} disabled={day.date > today}
            accessibilityLabel={readableTransactionDate(day.date) + ', ' + (day.date > today ? 'Upcoming' : 'income ' + formatAmount(day.income) + ', expenses ' + formatAmount(day.expenses))}
            onPress={() => setSelectedDate(selectedDate === day.date ? '' : day.date)} style={{ flex: 1, minWidth: 0, opacity: day.date > today ? 0.35 : 1, backgroundColor: selected?.date === day.date ? theme.backgroundSelected : 'transparent' }}>
            <View style={{ height: halfHeight, justifyContent: 'flex-end', alignItems: 'center' }}><View testID={'summary-income-' + day.date} style={{ width: '65%', height: day.income / maximum * (halfHeight - 2), backgroundColor: theme.income }} /></View>
            <View style={{ height: halfHeight, alignItems: 'center' }}><View testID={'summary-expense-' + day.date} style={{ width: '65%', height: day.expenses / maximum * (halfHeight - 2), backgroundColor: theme.expense }} /></View>
          </Pressable>)}
        </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: 46 }}>{[days[0],days.at(-1)].map((day,index) => <ThemedText key={index} type="small" themeColor="textSecondary" style={{ fontSize: 9 }}>{day ? new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day.date+'T12:00:00Z')) : ''}</ThemedText>)}</View>
      </View> : null}
      <View style={{ width: showChart ? '42%' : '100%', gap: 8, justifyContent: 'center' }}>
        {values.map(item => <View key={item.label} style={{ gap: 2 }}>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10, lineHeight: 14 }}>{item.label}</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name={item.label === 'Income' ? 'trending-up' : 'trending-down'} size={14} color={item.color} />
            <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', color: item.color, fontVariant: ['tabular-nums'] }}>{formatAmount(item.amount)}</ThemedText>
          </View>
        </View>)}
      </View>
    </View>
    {showChart && selected ? <ThemedText type="small" accessibilityLiveRegion="polite">{readableTransactionDate(selected.date)}: income {formatAmount(selected.income)}, expenses {formatAmount(selected.expenses)}</ThemedText> : null}
    {monthly ? <View style={{ gap: 2 }}><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 9, lineHeight: 14 }}>Income - expenses</ThemedText><ThemedText type="smallBold" numberOfLines={1} adjustsFontSizeToFit style={{ color: income >= expenses ? theme.income : theme.expense, fontVariant: ['tabular-nums'] }}>{formatAmount(income - expenses)}</ThemedText></View> : null}
  </View>;
}
