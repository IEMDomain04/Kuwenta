import { ThemedText } from "@/components/themed-text";
import { useAmountVisibility } from "@/hooks/amount-visibility";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTheme } from "@/hooks/use-theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { activityWeek, dashboardReport, dashboardSpending } from "../dashboard";
import {
  formatTransactionDateTime,
  philippineDateTime,
  readableTransactionDate,
} from "../dates";
import {
  HOME_REPORTING_OPTIONS,
  homeReportingPeriod,
  spendingCalendarRows,
  type HomeReportingSelection,
} from "../home-reporting";
import {
  DEFAULT_HOME_VISUALIZATIONS,
  type HomeVisualization,
} from "../home-visualizations";
import { useFinance } from "../provider";
import { AccountBalances } from "./account-balances";
import { CategorySpending } from "./category-spending";
import { IncomeExpenseChart, SpendingTrend } from "./dashboard-charts";
import { HomeMonthPicker } from "./home-month-picker";
import { SelectionSheet } from "./selection-sheet";

export function PeriodOverview({
  now,
  visible = DEFAULT_HOME_VISUALIZATIONS,
}: {
  now: Date;
  visible?: readonly HomeVisualization[];
}) {
  const { transactions } = useFinance();
  const today = philippineDateTime(now).transactionDate;
  const theme = useTheme();
  const { formatAmount: formatMoney, conceal } = useAmountVisibility();
  const dark = useColorScheme() === "dark";
  const { fontScale, width, height } = useWindowDimensions();
  const [selection, setSelection] = useState<HomeReportingSelection>("week");
  const [customMonth, setCustomMonth] = useState(today.slice(0, 7));
  const [periodOpen, setPeriodOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [dailyOpen, setDailyOpen] = useState(false);
  const [recordLimit, setRecordLimit] = useState(10);
  const range = useMemo(
    () => homeReportingPeriod(selection, customMonth, now),
    [selection, customMonth, now],
  );
  const { period, month } = range;
  const monthly = period === "month";
  const showBalances = visible.includes("balances");
  const showActivity = visible.includes("activity");
  const showSummary = visible.includes("summary");
  const showCategories = visible.includes("categories");
  const showTrend = visible.includes("trend");
  const showComparison = visible.includes("comparison");
  const needsReport = showSummary || showCategories || showComparison;
  const needsHistory = needsReport || showActivity || showTrend;
  const records = useMemo(
    () =>
      needsHistory
        ? transactions.filter((row) => row.transactionDate <= today)
        : [],
    [transactions, today, needsHistory],
  );
  const report = useMemo(
    () =>
      needsReport
        ? dashboardReport(records, period, month, range.anchor)
        : null,
    [records, period, month, range.anchor, needsReport],
  );
  const week = useMemo(
    () =>
      showActivity && period === "week"
        ? activityWeek(records, now, selection === "last-week" ? -1 : 0)
        : null,
    [records, now, selection, period, showActivity],
  );
  // Tiles and trend share a single daily series and the same calendar boundaries.
  const days = useMemo(
    () =>
      !showActivity && !showTrend
        ? []
        : (week?.days ??
          dashboardSpending(records, period, month, range.anchor).map(
            (day) => ({ ...day, isToday: day.date === today }),
          )),
    [
      records,
      period,
      month,
      range.anchor,
      today,
      week,
      showActivity,
      showTrend,
    ],
  );
  const calendar = useMemo(
    () => (monthly && showActivity ? spendingCalendarRows(days) : []),
    [monthly, showActivity, days],
  );
  const paired =
    showActivity && showSummary && width >= 350 && fontScale <= 1.3;
  // Leave room for the comparison labels when system text is enlarged.
  const sizeScale = Math.max(1, fontScale / 1.15);
  const calendarHeight = Math.ceil(124 * sizeScale);
  const selectedRecords = useMemo(
    () =>
      dailyOpen && selectedDate
        ? records
            .filter(
              (row) =>
                row.type === "EXPENSE" && row.transactionDate === selectedDate,
            )
            .sort((a, b) => b.transactionTime.localeCompare(a.transactionTime))
        : [],
    [records, dailyOpen, selectedDate],
  );
  const selected = days.find((day) => day.date === selectedDate);
  const hasExpenses = days.some((day) => day.expenses > 0);
  const spendingColors = dark
    ? [theme.background, "#14532D", "#15803D", "#22C55E", "#86EFAC"]
    : [theme.background, "#DCFCE7", "#86EFAC", "#16A34A", "#14532D"];
  function choosePeriod(value: HomeReportingSelection) {
    setSelection(value);
    setSelectedDate("");
    setDailyOpen(false);
    if (value === "custom") setMonthOpen(true);
  }
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
  const periodPicker = (
    <View style={{ gap: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <ThemedText type="smallBold" style={{ fontSize: 11 }}>
          Reporting period
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          {selection === "custom" ? (
            <HomeMonthPicker
              compact
              value={customMonth}
              open={monthOpen}
              onOpenChange={setMonthOpen}
              onChange={(value) => {
                setCustomMonth(value);
                setSelectedDate("");
                setDailyOpen(false);
              }}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={"Choose Home reporting period, " + range.label}
            onPress={() => setPeriodOpen(true)}
            style={{
              minHeight: 44,
              paddingHorizontal: 8,
              borderRadius: 12,
              backgroundColor: theme.backgroundElement,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ThemedText
              type="smallBold"
              themeColor="accent"
              style={{ fontSize: 11, lineHeight: 16 }}
            >
              {selection === "custom" ? "Choose month" : range.label}
            </ThemedText>
            <Ionicons name="chevron-down" size={14} color={theme.accent} />
          </Pressable>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {range.dates}
      </ThemedText>
      <SelectionSheet
        visible={periodOpen}
        title="Home reporting period"
        selected={selection}
        options={[...HOME_REPORTING_OPTIONS]}
        disabled={false}
        onClose={() => setPeriodOpen(false)}
        onSelect={(value) => choosePeriod(value as HomeReportingSelection)}
      />
    </View>
  );
  if (
    !showBalances &&
    !showActivity &&
    !showSummary &&
    !showCategories &&
    !showTrend &&
    !showComparison
  )
    return null;
  return (
    <View style={{ gap: 12 }}>
      {needsHistory ? periodPicker : null}
      {showActivity || showSummary ? (
        <View
          style={{
            flexDirection: paired ? "row" : "column",
            alignItems: "stretch",
            gap: 10,
          }}
        >
          {showActivity ? (
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
                    onPress={() => setDailyOpen(true)}
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
                    onPress={() => setDailyOpen(true)}
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
                            setSelectedDate((current) =>
                              current === day.date ? "" : day.date,
                            )
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
                  {week?.difference != null || hasExpenses ? <ThemedText
                    type="small"
                    style={{ fontSize: 10, lineHeight: 14 }}
                    themeColor="textSecondary"
                  >
                    {week?.difference != null
                      ? week.difference === 0
                        ? "Same as previous week"
                        : formatMoney(Math.abs(week.difference), true) +
                          (week.difference > 0 ? " more" : " less") +
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
          ) : null}
          {showSummary && report ? (
            <View
              testID="income-expense-summary-card"
              style={{
                flexGrow: paired ? 42 : 0,
                flexBasis: paired ? 0 : undefined,
                minWidth: 0,
                padding: 10,
                borderRadius: 20,
                backgroundColor: theme.backgroundElement,
                gap: 4,
                justifyContent: "flex-start",
              }}
            >
              <ThemedText
                type="smallBold"
                style={{ fontSize: 13, lineHeight: 18 }}
              >
                {range.label}
              </ThemedText>
              {[
                {
                  label: "Income",
                  amount: report.income,
                  color: theme.income,
                  icon: "trending-up",
                },
                {
                  label: "Expenses",
                  amount: report.expenses,
                  color: theme.expense,
                  icon: "trending-down",
                },
              ].map((item) => (
                <View key={item.label} style={{ gap: 1 }}>
                  <ThemedText
                    type="small"
                    style={{ fontSize: 10, lineHeight: 14 }}
                    themeColor="textSecondary"
                  >
                    {item.label}
                  </ThemedText>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name={item.icon as "trending-up" | "trending-down"}
                      size={14}
                      color={item.color}
                    />
                    <ThemedText
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                      style={{
                        flex: 1,
                        fontSize: 16,
                        lineHeight: 22,
                        fontWeight: "700",
                        color: item.color,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {formatMoney(item.amount)}
                    </ThemedText>
                  </View>
                </View>
              ))}
              {monthly ? (
                <View style={{ gap: 2 }}>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={{ fontSize: 9, lineHeight: 14 }}
                  >
                    Income - expenses
                  </ThemedText>
                  <ThemedText
                    type="smallBold"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    style={{
                      fontVariant: ["tabular-nums"],
                      color:
                        report.income >= report.expenses
                          ? theme.income
                          : theme.expense,
                    }}
                  >
                    {formatMoney(report.income - report.expenses)}
                  </ThemedText>
                </View>
              ) : null}
              {monthly ? (
                <View style={{ gap: 3 }}>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={{ fontSize: 9, lineHeight: 12 }}
                  >
                    Income vs. expenses
                  </ThemedText>
                  <View
                    testID="income-expense-comparison"
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={
                      "Recorded income " +
                      formatMoney(report.income) +
                      "; expenses " +
                      formatMoney(report.expenses)
                    }
                    style={{
                      height: 8,
                      borderRadius: 4,
                      overflow: "hidden",
                      flexDirection: "row",
                      backgroundColor: theme.backgroundSelected,
                    }}
                  >
                    <View
                      testID="income-comparison-segment"
                      style={{
                        height: 8,
                        width: `${(report.income / Math.max(1, report.income + report.expenses)) * 100}%`,
                        backgroundColor: theme.income,
                      }}
                    />
                    <View
                      testID="expense-comparison-segment"
                      style={{
                        height: 8,
                        width: `${(report.expenses / Math.max(1, report.income + report.expenses)) * 100}%`,
                        backgroundColor: theme.expense,
                      }}
                    />
                  </View>
                  {report.income || report.expenses ? (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        { label: "Income", color: theme.income },
                        { label: "Expenses", color: theme.expense },
                      ].map((item) => (
                        <View
                          key={item.label}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <View
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 2,
                              backgroundColor: item.color,
                            }}
                          />
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            style={{ fontSize: 8, lineHeight: 12 }}
                          >
                            {item.label}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={{ fontSize: 8, lineHeight: 12 }}
                    >
                      No recorded activity
                    </ThemedText>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {dailyOpen ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setDailyOpen(false)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
              backgroundColor: theme.overlay,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close daily spending"
              onPress={() => setDailyOpen(false)}
              style={{ flex: 1 }}
            />
            <SafeAreaView
              edges={["bottom", "left", "right"]}
              style={{
                maxHeight: height * 0.85,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                backgroundColor: theme.backgroundElement,
              }}
            >
              <View accessibilityViewIsModal style={{ padding: 16, gap: 8 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <ThemedText
                    type="smallBold"
                    accessibilityRole="header"
                    style={{ flex: 1 }}
                  >
                    Daily spending
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close daily spending"
                    onPress={() => setDailyOpen(false)}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="close" size={20} color={theme.text} />
                  </Pressable>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {range.label}
                </ThemedText>
                <ScrollView
                  style={{ maxHeight: height * 0.55 }}
                  contentContainerStyle={{ gap: 4, paddingBottom: 8 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {days.map((day) => (
                    <View key={day.date}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{
                          expanded: selectedDate === day.date,
                          disabled: day.date > today,
                        }}
                        disabled={day.date > today}
                        accessibilityLabel={
                          readableTransactionDate(day.date) +
                          ", " +
                          (day.date > today
                            ? "Upcoming"
                            : formatMoney(day.expenses) + " spent")
                        }
                        onPress={() => {
                          setSelectedDate((current) =>
                            current === day.date ? "" : day.date,
                          );
                          setRecordLimit(10);
                        }}
                        style={{
                          minHeight: 48,
                          padding: 10,
                          borderRadius: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          backgroundColor:
                            selectedDate === day.date
                              ? theme.backgroundSelected
                              : theme.background,
                        }}
                      >
                        <ThemedText type="small" style={{ flex: 1 }}>
                          {readableTransactionDate(day.date)}
                        </ThemedText>
                        <ThemedText
                          type="smallBold"
                          style={{ flexShrink: 1, textAlign: "right" }}
                        >
                          {day.date > today
                            ? "Upcoming"
                            : formatMoney(day.expenses)}
                        </ThemedText>
                        <Ionicons
                          name={
                            selectedDate === day.date
                              ? "chevron-up"
                              : "chevron-down"
                          }
                          size={14}
                          color={theme.textSecondary}
                        />
                      </Pressable>
                      {selectedDate === day.date ? (
                        <View style={{ padding: 10, gap: 6 }}>
                          {!selectedRecords.length ? (
                            <ThemedText type="small" themeColor="textSecondary">
                              No expenses recorded on this day.
                            </ThemedText>
                          ) : null}
                          {selectedRecords
                            .slice(0, recordLimit)
                            .map((record) => (
                              <Pressable
                                key={record.id}
                                accessibilityRole="button"
                                accessibilityLabel={
                                  "View " +
                                  conceal(
                                    record.notes?.trim() || record.category,
                                  ) +
                                  ", " +
                                  formatMoney(record.amount)
                                }
                                onPress={() => {
                                  setDailyOpen(false);
                                  router.push({
                                    pathname: "/transaction",
                                    params: {
                                      id: record.exchangeParentId ?? record.id,
                                    },
                                  });
                                }}
                                style={{
                                  minHeight: 48,
                                  gap: 3,
                                  justifyContent: "center",
                                }}
                              >
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                  <ThemedText
                                    type="smallBold"
                                    numberOfLines={2}
                                    style={{ flex: 1 }}
                                  >
                                    {conceal(
                                      record.notes?.trim() || record.category,
                                    )}
                                  </ThemedText>
                                  <ThemedText
                                    type="smallBold"
                                    style={{ flexShrink: 1 }}
                                  >
                                    {formatMoney(record.amount)}
                                  </ThemedText>
                                </View>
                                <ThemedText
                                  type="small"
                                  themeColor="textSecondary"
                                >
                                  {conceal(record.category)} |{" "}
                                  {formatTransactionDateTime(
                                    record.transactionDate,
                                    record.transactionTime,
                                  )}
                                </ThemedText>
                              </Pressable>
                            ))}
                          {selectedRecords.length > recordLimit ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                setRecordLimit((value) => value + 10)
                              }
                              style={{
                                minHeight: 44,
                                justifyContent: "center",
                              }}
                            >
                              <ThemedText type="smallBold" themeColor="accent">
                                Show more transactions
                              </ThemedText>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
      {showBalances ? <AccountBalances /> : null}
      {showCategories && report ? (
        <CategorySpending
          key={period + report.start + report.end}
          transactions={records}
          start={report.start}
          end={report.end}
          period={period}
          label={range.label}
        />
      ) : null}
      {showTrend ? (
        <SpendingTrend
          key={period + month + (days[0]?.date ?? "")}
          days={days}
          period={period}
          transactions={records}
          now={now}
          label={range.label}
        />
      ) : null}
      {showComparison && report ? (
        <IncomeExpenseChart income={report.income} expenses={report.expenses} />
      ) : null}
    </View>
  );
}
