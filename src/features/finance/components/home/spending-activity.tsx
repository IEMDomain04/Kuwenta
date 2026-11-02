import { ThemedText } from "@/components/themed-text";
import { useAmountVisibility } from "@/hooks/amount-visibility";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTheme } from "@/hooks/use-theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useMemo } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { readableTransactionDate } from "../../domain/dates";
import type { activityWeek } from "../../reporting/dashboard";
import {
  spendingCalendarRows,
  type homeReportingPeriod,
  type HomeReportingSelection,
} from "../../reporting/home-reporting";

type SpendingActivityProps = {
  days: ReturnType<typeof activityWeek>["days"];
  range: ReturnType<typeof homeReportingPeriod>;
  selection: HomeReportingSelection;
  paired: boolean;
  selectedDate: string;
  today: string;
  weekDifference?: number | null;
  onSelectDate: (date: string) => void;
  onOpenDaily: () => void;
};

/** Weekly tiles and the compact six-row monthly calendar share one daily series. */
export function SpendingActivity({
  days,
  range,
  selection,
  paired,
  selectedDate,
  today,
  weekDifference,
  onSelectDate,
  onOpenDaily,
}: SpendingActivityProps) {
  const theme = useTheme();
  const { formatAmount: formatMoney } = useAmountVisibility();
  const dark = useColorScheme() === "dark";
  const { fontScale } = useWindowDimensions();
  const monthly = range.period === "month";
  const calendar = useMemo(
    () => monthly ? spendingCalendarRows(days) : [],
    [monthly, days],
  );
  // Leave room for comparison labels when system text is enlarged.
  const calendarHeight = Math.ceil(124 * Math.max(1, fontScale / 1.15));
  const selected = days.find((day) => day.date === selectedDate);
  const hasExpenses = days.some((day) => day.expenses > 0);
  const spendingColors = dark
    ? [theme.background, "#14532D", "#15803D", "#22C55E", "#86EFAC"]
    : [theme.background, "#DCFCE7", "#86EFAC", "#16A34A", "#14532D"];
  function spendingLevel(amount: number) {
    return amount === 0
      ? 0
      : amount < 15_000
        ? 1
        : amount < 30_000
          ? 2
          : amount < 50_000
            ? 3
            : 4;
  }
  const legend = (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 3,
      }}
    >
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={{ fontSize: 8, lineHeight: 12 }}
      >
        Less
      </ThemedText>
      {spendingColors.map((color, index) => (
        <View
          key={index}
          style={{
            width: 7,
            height: 7,
            borderRadius: 2,
            backgroundColor: color,
            borderWidth: index === 0 ? 1 : 0,
            borderColor: theme.border,
          }}
        />
      ))}
      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={{ fontSize: 8, lineHeight: 12 }}
      >
        More
      </ThemedText>
    </View>
  );
  return (
    <View
      testID="spending-activity-card"
      style={{
        flexGrow: paired ? 58 : 0,
        flexBasis: paired ? 0 : undefined,
        minWidth: 0,
        padding: 8,
        borderRadius: 20,
        backgroundColor: theme.backgroundElement,
        gap: monthly ? 2 : 4,
      }}
    >
      <ThemedText
        type="small"
        numberOfLines={1}
        style={{ fontSize: 10, lineHeight: 14 }}
        themeColor="textSecondary"
      >
        {monthly
          ? "SPENDING ACTIVITY"
          : selection === "last-week"
            ? "LAST WEEK"
            : "THIS WEEK"}
      </ThemedText>
      {monthly ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              "View daily spending for " + range.label
            }
            onPress={() => onOpenDaily()}
            style={{ gap: 3 }}
          >
            <View style={{ flexDirection: "row", gap: 3 }}>
              {["M", "T", "W", "T", "F", "S", "S"].map(
                (label, index) => (
                  <ThemedText
                    key={index}
                    type="small"
                    themeColor="textSecondary"
                    style={{
                      flex: 1,
                      textAlign: "center",
                      fontSize: 8,
                      lineHeight: 12,
                    }}
                  >
                    {label}
                  </ThemedText>
                ),
              )}
            </View>
            <View
              testID="spending-calendar"
              style={{ height: calendarHeight, gap: 3 }}
            >
              {calendar.map((row, weekIndex) => (
                <View
                  key={weekIndex}
                  testID="spending-calendar-row"
                  style={{ flex: 1, flexDirection: "row", gap: 3 }}
                >
                  {row.map((day, weekday) => {
                    const level = spendingLevel(day?.expenses ?? 0);
                    const ink = dark
                      ? level >= 3
                        ? "#082417"
                        : theme.text
                      : level === 4
                        ? "#FFFFFF"
                        : theme.text;
                    return (
                      <View
                        key={weekday}
                        testID={
                          day ? "spending-calendar-day" : undefined
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          borderRadius: 3,
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor: day
                            ? spendingColors[level]
                            : "transparent",
                          borderWidth: day ? 1 : 0,
                          borderColor: day?.isToday
                            ? theme.accent
                            : theme.border,
                          opacity: day && day.date > today ? 0.5 : 1,
                        }}
                      >
                        {day ? (
                          <ThemedText
                            type="small"
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={{
                              fontSize: 9,
                              lineHeight: 12,
                              color: ink,
                              fontWeight: day.isToday ? "700" : "500",
                            }}
                          >
                            {Number(day.date.slice(8))}
                          </ThemedText>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </Pressable>
          {legend}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open daily spending"
            onPress={() => onOpenDaily()}
            style={{
              minHeight: 20,
              paddingVertical: 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 4,
            }}
          >
            <ThemedText
              type="smallBold"
              themeColor="accent"
              style={{ fontSize: 10, lineHeight: 14 }}
            >
              View daily spending
            </ThemedText>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={theme.accent}
            />
          </Pressable>
        </>
      ) : (
        <>
          <View style={{ flexGrow: 1, gap: 8, minHeight: 90 }}>
            <View style={{ flexGrow: 1, flexDirection: "row", gap: 3 }}>
              {days.map((day) => (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={
                    readableTransactionDate(day.date) +
                    ", " +
                    formatMoney(day.expenses) +
                    " spent"
                  }
                  accessibilityState={{
                    selected: selectedDate === day.date,
                    disabled: day.date > today,
                  }}
                  disabled={day.date > today}
                  onPress={() =>
                    onSelectDate(day.date)
                  }
                  style={{
                    flex: 1,
                    minHeight: 44,
                    opacity: day.date > today ? 0.4 : 1,
                    justifyContent: "center",
                    gap: 5,
                  }}
                >
                  <View
                    style={{
                      width: "100%",
                      flexGrow: 1,
                      minHeight: 30,
                      borderRadius: 4,
                      backgroundColor:
                        spendingColors[spendingLevel(day.expenses)],
                      borderWidth: 1,
                      borderColor:
                        selectedDate === day.date
                          ? theme.text
                          : theme.border,
                    }}
                  />
                  <ThemedText
                    type="small"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      textAlign: "center",
                      fontSize: 9,
                      lineHeight: 13,
                      color: day.isToday
                        ? theme.accent
                        : theme.textSecondary,
                      fontWeight: day.isToday ? "700" : "400",
                    }}
                  >
                    {day.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            {legend}
          </View>
          {weekDifference != null || hasExpenses ? <ThemedText
            type="small"
            style={{ fontSize: 10, lineHeight: 14 }}
            themeColor="textSecondary"
          >
            {weekDifference != null
              ? weekDifference === 0
                ? "Same as previous week"
                : formatMoney(Math.abs(weekDifference), true) +
                  (weekDifference > 0 ? " more" : " less") +
                  " than previous week"
              : "Tap a tile for details"}
          </ThemedText> : null}
          {selected ? (
            <ThemedText
              accessibilityLiveRegion="polite"
              type="small"
              style={{ fontSize: 11, lineHeight: 16 }}
            >
              {readableTransactionDate(selected.date)}:{" "}
              {formatMoney(selected.expenses)}
            </ThemedText>
          ) : null}
        </>
      )}
    </View>
  );
}
