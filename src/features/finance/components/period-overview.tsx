import { SelectionSheet } from './selection-sheet';
import { SpendingTrend, IncomeExpenseChart } from './dashboard-charts';
import { DEFAULT_HOME_VISUALIZATIONS, type HomeVisualization } from '../home-visualizations';
import { CategorySpending } from './category-spending';
import { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { activityWeek, dashboardReport, dashboardSpending, type DashboardPeriod } from '../dashboard';
import { philippineDateTime, readableTransactionDate } from '../dates';
import { formatMoney } from '../money';
import { useFinance } from '../provider';

export function PeriodOverview({ now, visible = DEFAULT_HOME_VISUALIZATIONS }: { now: Date; visible?: readonly HomeVisualization[] }) {
  const { transactions } = useFinance();
  const month = philippineDateTime(now).transactionDate.slice(0, 7);
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const [period, setPeriod] = useState<DashboardPeriod>('day');
  const [selectedDate, setSelectedDate] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekOpen, setWeekOpen] = useState(false);
  const [weekCount, setWeekCount] = useState(12);
  const showActivity = visible.includes('activity');
  const showSummary = visible.includes('summary');
  const showCategories = visible.includes('categories');
  const showTrend = visible.includes('trend');
  const showComparison = visible.includes('comparison');
  const needsReport = showSummary || showCategories || showComparison;
  const report = useMemo(() => needsReport ? dashboardReport(transactions, period, month, now) : null, [transactions, period, month, now, needsReport]);
  const week = useMemo(() => showActivity ? activityWeek(transactions, now, weekOffset) : null, [transactions, now, weekOffset, showActivity]);
  const days = week?.days ?? [];
  const trendDays = useMemo(() => showTrend ? showActivity && weekOffset === 0 && period === 'week' ? days : dashboardSpending(transactions, period, month, now) : [], [transactions, period, month, now, showTrend, showActivity, days, weekOffset]);
  const selected = days.find((day) => day.date === selectedDate);
  const hasExpenses = days.some((day) => day.expenses > 0);
  const spendingColors = [theme.background, '#14532D', '#15803D', '#22C55E', '#86EFAC'];
  function choosePeriod(value: DashboardPeriod) { setPeriod(value); }
  const periodPicker = <View style={{ flexDirection: 'row', backgroundColor: theme.incomeSurface, borderRadius: 20, marginTop: 2 }}>
        {(['day', 'week', 'month'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value + ' report'} accessibilityState={{ selected: period === value }} onPress={() => choosePeriod(value)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: period === value ? theme.accent : 'transparent' }}>
          <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: period === value ? theme.onAccent : theme.textSecondary }}>{value === 'day' ? 'Day' : value === 'week' ? 'Week' : 'Month'}</ThemedText>
        </Pressable>)}
      </View>;
  if (!showActivity && !showSummary && !showCategories && !showTrend && !showComparison) return null;
  return <View style={{ gap: 12 }}>
    {showActivity || showSummary ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
    {showActivity ? <View style={{ flexGrow: 1, flexBasis: fontScale > 1.3 ? '100%' : 130, minWidth: 120, padding: 8, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <ThemedText type="small" numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, flexShrink: 0 }} themeColor="textSecondary">{weekOffset === 0 ? 'THIS WEEK' : 'WEEK'}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose spending week" hitSlop={10} onPress={() => setWeekOpen(true)} style={{ flex: 1, minWidth: 0, minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}><ThemedText type="small" numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, fontSize: 9 }}>{week?.label}</ThemedText><Ionicons name="chevron-down" size={12} color={theme.accent}/></Pressable>
      </View>
      <SelectionSheet visible={weekOpen} title="Spending week" selected={String(weekOffset)} disabled={false} onClose={() => setWeekOpen(false)} options={[...Array.from({ length: weekOpen ? weekCount : 0 }, (_,index) => { try { const item=activityWeek([],now,-index); return {value:String(-index),label:(index===0?'This week | ':'')+item.label}; } catch { return null; } }).filter((item): item is {value:string;label:string} => item!==null),{value:'older',label:'Show older weeks',keepOpen:true}]} onSelect={value=>{if(value==='older'){setWeekCount(count=>count+12);}else{setWeekOffset(Number(value));setSelectedDate('');}}}/>
      <View style={{ flexGrow: 1, gap: 8, minHeight: 90 }}>
        <View style={{ flexGrow: 1, flexDirection: 'row', gap: 3 }}>
          {days.map((day) => {
            // Daily totals are stored in centavos; levels stay fixed across weeks.
            const level = day.expenses === 0 ? 0 : day.expenses < 15_000 ? 1 : day.expenses < 30_000 ? 2 : day.expenses < 50_000 ? 3 : 4;
            return <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={readableTransactionDate(day.date) + ', ' + formatMoney(day.expenses) + ' spent'} accessibilityState={{ selected: selectedDate === day.date }} onPress={() => setSelectedDate(day.date)} style={{ flex: 1, minHeight: 44, justifyContent: 'center', gap: 5 }}>
              <View style={{ width: '100%', flexGrow: 1, minHeight: 30, borderRadius: 4, backgroundColor: spendingColors[level], borderWidth: 1, borderColor: selectedDate === day.date ? theme.text : theme.border }} />
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
      <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">{week?.difference != null ? week.difference === 0 ? 'Same as previous week' : formatMoney(Math.abs(week.difference), true) + (week.difference > 0 ? ' more' : ' less') + ' than previous week' : hasExpenses ? 'Tap a tile for details' : 'No expenses recorded'}</ThemedText>
      {selected ? <ThemedText accessibilityLiveRegion="polite" type="small" style={{ fontSize: 11, lineHeight: 16 }}>{new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(selected.date + 'T12:00:00Z'))}, {readableTransactionDate(selected.date)}: {formatMoney(selected.expenses)}</ThemedText> : null}
    </View> : null}
    {showSummary && report ? <View style={{ flexGrow: 1, flexBasis: 130, minWidth: 120, padding: 10, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 7 }}>
      <ThemedText type="smallBold" style={{ fontSize: 13, lineHeight: 18 }}>{period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</ThemedText>
      {[{ label: 'Income', amount: report.income, color: theme.income, icon: 'trending-up' }, { label: 'Expenses', amount: report.expenses, color: theme.expense, icon: 'trending-down' }].map((item) => <View key={item.label} style={{ gap: 1 }}>
        <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">{item.label}</ThemedText>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Ionicons name={item.icon as 'trending-up' | 'trending-down'} size={14} color={item.color} /><ThemedText numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', color: item.color, fontVariant: ['tabular-nums'] }}>{formatMoney(item.amount)}</ThemedText></View>
      </View>)}
      {periodPicker}
    </View> : null}
    </View> : null}
    {!showSummary && (showCategories || showTrend || showComparison) ? periodPicker : null}
    {showCategories && report ? <CategorySpending transactions={transactions} start={report.start} end={report.end} period={period} /> : null}
    {showTrend ? <SpendingTrend days={trendDays} period={period} /> : null}
    {showComparison && report ? <IncomeExpenseChart income={report.income} expenses={report.expenses} /> : null}
  </View>;
}
