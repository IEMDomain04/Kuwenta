import { useAmountVisibility } from '@/hooks/amount-visibility';
import { useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { dashboardSpending } from '../dashboard';
import { formatTransactionDateTime, philippineDateTime, readableTransactionDate } from '../dates';
import type { Transaction } from '../types';

export function SpendingTrend({ days, period, transactions = [], now = new Date() }: { days: ReturnType<typeof dashboardSpending>; period: string; transactions?: readonly Transaction[]; now?: Date }) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const periodLabel = period === 'day' ? 'Last 7 days' : period === 'week' ? 'This week' : 'This month';
  const { formatAmount: formatMoney, conceal } = useAmountVisibility();
  const [selectedDate, setSelectedDate] = useState('');
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const dragDate = useRef('');
  const plotLeft = useRef(0);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [recordLimit, setRecordLimit] = useState(10);
  const [plotWidth, setPlotWidth] = useState(0);
  const today = philippineDateTime(now).transactionDate;
  const elapsed = days.filter(day => day.date <= today);
  const maximum = Math.max(0, ...elapsed.map(day => day.expenses));
  const peak = elapsed.find(day => day.expenses === maximum);
  const selected = elapsed.find(day => day.date === (previewDate ?? selectedDate));
  const committed = elapsed.find(day => day.date === selectedDate);
  const records = useMemo(() => committed ? transactions.filter(row => row.type === 'EXPENSE' && row.transactionDate === committed.date)
    .sort((a, b) => b.transactionTime.localeCompare(a.transactionTime)) : [], [transactions, committed]);
  function dateAt(x: number, scrubbing = false) {
    if (!plotWidth || !days.length || !elapsed.length) return;
    let index = Math.max(0, Math.min(days.length - 1, Math.round((x / plotWidth * 300 - 8) / 284 * (days.length - 1))));
    if (scrubbing) index = Math.min(index, elapsed.length - 1);
    return days[index].date <= today ? days[index].date : undefined;
  }
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => gesture.numberActiveTouches === 1 && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
    onPanResponderGrant: event => {
      plotLeft.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
      dragDate.current = dateAt(event.nativeEvent.locationX, true) ?? '';
      setPreviewDate(dragDate.current || null);
    },
    onPanResponderMove: (_, gesture) => {
      const date = dateAt(gesture.moveX - plotLeft.current, true);
      if (date && date !== dragDate.current) { dragDate.current = date; setPreviewDate(date); }
    },
    onPanResponderRelease: () => {
      if (dragDate.current) setSelectedDate(dragDate.current);
      setPreviewDate(null); setRecordLimit(10); dragDate.current = '';
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { setPreviewDate(null); dragDate.current = ''; },
  }), [days, plotWidth, today]);
  const dateLabel = (date?: string) => date ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z')) : '';
  const point = (index: number, amount: number) => ({ x: 8 + index / Math.max(1, days.length - 1) * 284, y: 110 - amount / Math.max(1, maximum) * 100 });
  function choose(date: string) { setSelectedDate(value => value === date ? '' : date); setRecordLimit(10); }
  return <View style={{ backgroundColor: theme.backgroundElement, borderRadius: 20, padding: 14, gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ThemedText type="smallBold" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ flex: 1 }}>Spending trend</ThemedText>
      <ThemedText type="small" numberOfLines={1} themeColor="textSecondary" style={{ fontSize: 10, lineHeight: 14, flexShrink: 1, textAlign: 'right' }}>{periodLabel}</ThemedText>
    </View>
    {maximum ? <>
      <ThemedText type="small" accessibilityLabel={'Highest spending: ' + readableTransactionDate(peak!.date) + ', ' + formatMoney(maximum, true)}>Highest: {dateLabel(peak!.date)} / {formatMoney(maximum, true)}</ThemedText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View accessible={false} style={{ width: 68, height: 132, justifyContent: 'space-between', paddingTop: 2, paddingBottom: 2 }}>
          {[maximum, Math.round(maximum / 2), 0].map((amount, index) => <ThemedText key={index} type="small" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} themeColor="textSecondary" style={{ fontSize: 10, lineHeight: 14, textAlign: 'right' }}>{formatMoney(amount, true)}</ThemedText>)}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View {...pan.panHandlers}>
          <Pressable accessible={false} onLayout={event => setPlotWidth(event.nativeEvent.layout.width)} onPress={event => {
            const date = dateAt(event.nativeEvent.locationX);
            if (date) choose(date);
          }} style={{ height: 132 }}>
            <Svg width="100%" height={132} viewBox="0 0 300 120" preserveAspectRatio="none" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
              {[10, 60, 110].map(y => <Line key={y} x1={8} x2={292} y1={y} y2={y} stroke={theme.border} strokeWidth={1} strokeDasharray={y === 110 ? undefined : '3,4'} />)}
              <Polyline points={elapsed.map((day, index) => { const p = point(index, day.expenses); return p.x + ',' + p.y; }).join(' ')} fill="none" stroke={theme.accent} strokeWidth={2.5} />
              {selected ? <Line x1={point(days.indexOf(selected), 0).x} x2={point(days.indexOf(selected), 0).x} y1={10} y2={110} stroke={theme.textSecondary} strokeWidth={1} strokeDasharray="3,4" /> : null}
              {elapsed.map((day, index) => { const p = point(index, day.expenses); return <Circle key={day.date} cx={p.x} cy={p.y} r={selected?.date === day.date ? 5 : 3} fill={theme.accent} stroke={theme.backgroundElement} strokeWidth={selected?.date === day.date ? 2 : 0} />; })}
            </Svg>
          </Pressable>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10 }}>{dateLabel(days[0]?.date)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10 }}>{dateLabel(days.at(-1)?.date)}</ThemedText>
          </View>
        </View>
      </View>
    </> : <ThemedText type="small" themeColor="textSecondary">No expenses recorded for this period.</ThemedText>}
    {selected ? <View style={{ padding: 10, gap: 6, borderRadius: 12, backgroundColor: theme.background }}>
      <ThemedText type="smallBold" accessibilityLiveRegion={previewDate === null ? "polite" : "none"}>{readableTransactionDate(selected.date)}: {formatMoney(selected.expenses, true)}</ThemedText>
      {previewDate === null ? <>
      {!records.length ? <ThemedText type="small" themeColor="textSecondary">No expenses recorded on this day.</ThemedText> : null}
      {records.slice(0, recordLimit).map(record => <Pressable key={record.id} accessibilityRole="button" accessibilityLabel={'View ' + conceal(record.notes?.trim() || record.category) + ', ' + formatMoney(record.amount, true) + ', ' + formatTransactionDateTime(record.transactionDate, record.transactionTime)} onPress={() => router.push({ pathname: '/transaction', params: { id: record.exchangeParentId ?? record.id } })}
        style={({ pressed }) => ({ minHeight: 44, paddingVertical: 8, gap: 2, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ flexDirection: 'row', gap: 8 }}><ThemedText type="smallBold" numberOfLines={2} style={{ flex: 1 }}>{conceal(record.notes?.trim() || record.category)}</ThemedText><ThemedText type="smallBold" style={{ flexShrink: 1, textAlign: 'right' }}>{formatMoney(record.amount, true)}</ThemedText></View>
        <ThemedText type="small" themeColor="textSecondary">{formatTransactionDateTime(record.transactionDate, record.transactionTime)}</ThemedText>
      </Pressable>)}
      {records.length > recordLimit ? <Pressable accessibilityRole="button" onPress={() => setRecordLimit(value => value + 10)} style={{ minHeight: 44, justifyContent: 'center' }}><ThemedText type="smallBold" themeColor="accent">Show more transactions</ThemedText></Pressable> : null}
      </> : null}
    </View> : maximum ? <ThemedText type="small" themeColor="textSecondary">Tap or drag across the chart, or choose a day below.</ThemedText> : null}
    {days.length ? <Pressable accessibilityRole="button" accessibilityLabel="Daily spending" accessibilityState={{ expanded: dailyOpen }} onPress={() => setDailyOpen(true)} style={{ minHeight: 44, justifyContent: 'center' }}><ThemedText type="smallBold" themeColor="accent">View daily spending</ThemedText></Pressable> : null}
    {dailyOpen ? <Modal visible transparent animationType="fade" onRequestClose={() => setDailyOpen(false)}>
      <SafeAreaView style={{ flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close daily spending" onPress={() => setDailyOpen(false)} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 360, maxHeight: height * 0.8, padding: 16, borderRadius: 22, backgroundColor: theme.backgroundElement, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemedText type="smallBold" accessibilityRole="header" style={{ flex: 1 }}>Daily spending</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close daily spending" onPress={() => setDailyOpen(false)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons accessible={false} name="close" size={20} color={theme.text} /></Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary">{periodLabel}: {dateLabel(days[0]?.date)} to {dateLabel(days.at(-1)?.date)}</ThemedText>
          <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={{ gap: 4 }} keyboardShouldPersistTaps="handled">
            {days.map(day => <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={readableTransactionDate(day.date) + ', ' + (day.date > today ? 'Upcoming' : formatMoney(day.expenses, true) + ' spent')} accessibilityState={{ selected: selectedDate === day.date, disabled: day.date > today }} disabled={day.date > today} onPress={() => { setSelectedDate(day.date); setRecordLimit(10); setDailyOpen(false); }} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: selectedDate === day.date ? theme.backgroundSelected : 'transparent', opacity: pressed ? 0.7 : 1 })}>
              <ThemedText type="small" style={{ flex: 1 }}>{dateLabel(day.date)}</ThemedText><ThemedText type="small" themeColor={day.date > today ? 'textSecondary' : undefined}>{day.date > today ? 'Upcoming' : formatMoney(day.expenses, true)}</ThemedText>
            </Pressable>)}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal> : null}
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
