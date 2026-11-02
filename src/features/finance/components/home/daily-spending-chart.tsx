import { ThemedText } from "@/components/themed-text";
import { useAmountVisibility } from "@/hooks/amount-visibility";
import { useTheme } from "@/hooks/use-theme";
import { useState } from "react";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Pressable, ScrollView, View } from "react-native";
import { readableTransactionDate } from "../../domain/dates";
import type { dashboardSpending } from "../../reporting/dashboard";

type DailySpendingChartProps = {
  days: ReturnType<typeof dashboardSpending>;
  today: string;
  monthly: boolean;
  label: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BAR_HEIGHT = 128;
const BAR_GAP = 6;

export function DailySpendingChart({
  days,
  today,
  monthly,
  label,
  selectedDate,
  onSelectDate,
}: DailySpendingChartProps) {
  const theme = useTheme();
  const { formatAmount } = useAmountVisibility();
  const [plotWidth, setPlotWidth] = useState(0);
  const [scroll, setScroll] = useState({ key: "", offset: 0 });
  const periodKey = monthly + ":" + days[0]?.date + ":" + days.at(-1)?.date;
  // Fit complete bars plus half of the next bar as a cue that more days follow.
  const fullBars = Math.max(1, Math.min(days.length - 1, Math.floor(plotWidth / 48)));
  const barWidth = plotWidth > 0 ? (plotWidth - fullBars * BAR_GAP) / (fullBars + 0.5) : 44;
  const contentWidth = days.length * barWidth + Math.max(0, days.length - 1) * BAR_GAP;
  const thumbWidth = Math.min(plotWidth, Math.max(24, plotWidth * plotWidth / Math.max(1, contentWidth)));
  const progress = scroll.key === periodKey
    ? Math.max(0, Math.min(1, scroll.offset / Math.max(1, contentWidth - plotWidth)))
    : 0;
  const maximum = Math.max(0, ...days.filter(day => day.date <= today).map(day => day.expenses));
  const selected = days.find(day => day.date === selectedDate && day.date <= today);

  return (
    <View testID="daily-spending-chart" style={{ padding: 14, gap: 10, borderRadius: 20, backgroundColor: theme.backgroundElement }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ThemedText type="smallBold" accessibilityRole="header" style={{ flex: 1 }}>Daily spending</ThemedText>
        {monthly ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1 }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10 }}>Swipe for more</ThemedText>
            <Ionicons name="chevron-forward" size={12} color={theme.textSecondary} />
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={{ flexShrink: 1, textAlign: "right", fontSize: 11 }}>{label}</ThemedText>
        )}
      </View>
      {monthly ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>{label}</ThemedText> : null}
      <ScrollView
        key={periodKey}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={event => setPlotWidth(event.nativeEvent.layout.width)}
        onScroll={monthly ? event => setScroll({ key: periodKey, offset: event.nativeEvent.contentOffset.x }) : undefined}
        scrollEventThrottle={32}
        contentContainerStyle={{ flexGrow: 1, gap: BAR_GAP }}
      >
        {days.map(day => {
          const future = day.date > today;
          const active = selected?.date === day.date;
          return (
            <Pressable
              key={day.date}
              accessibilityRole="button"
              accessibilityLabel={readableTransactionDate(day.date) + (day.isToday ? ", Today" : "") + ", " + (future ? "Upcoming" : formatAmount(day.expenses) + " spent")}
              accessibilityState={{ selected: active, disabled: future }}
              disabled={future}
              onPress={() => onSelectDate(day.date)}
              style={{ flex: monthly ? undefined : 1, width: monthly ? barWidth : undefined, minWidth: 32, gap: 5, alignItems: "center", opacity: future ? 0.4 : 1 }}
            >
              <View style={{ height: BAR_HEIGHT, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
                <View
                  testID={"daily-spending-bar-" + day.date}
                  style={{
                    width: "70%",
                    height: !future && day.expenses > 0 ? day.expenses / Math.max(1, maximum) * BAR_HEIGHT : 2,
                    borderRadius: 4,
                    backgroundColor: active ? theme.text : (!future && day.expenses > 0 ? theme.accent : theme.border),
                  }}
                />
              </View>
              <ThemedText type="small" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 10, lineHeight: 16, color: day.isToday ? theme.accent : theme.textSecondary }}>
                {monthly ? Number(day.date.slice(8)) : WEEKDAYS[new Date(day.date + "T12:00:00Z").getUTCDay()]}
              </ThemedText>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: day.isToday ? theme.accent : "transparent" }} />
            </Pressable>
          );
        })}
      </ScrollView>
      {monthly ? (
        <View testID="daily-spending-scroll-track" accessible={false} pointerEvents="none" style={{ height: 3, borderRadius: 2, backgroundColor: theme.backgroundSelected, overflow: "hidden" }}>
          <View testID="daily-spending-scroll-thumb" style={{ height: 3, width: thumbWidth, borderRadius: 2, backgroundColor: theme.accent, transform: [{ translateX: progress * (plotWidth - thumbWidth) }] }} />
        </View>
      ) : null}
      {selected ? (
        <ThemedText type="smallBold" accessibilityLiveRegion="polite">
          {readableTransactionDate(selected.date)}: {formatAmount(selected.expenses)} spent
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {maximum ? "Tap a bar for details." : "No expenses recorded for this period."}
        </ThemedText>
      )}
    </View>
  );
}
