import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useMemo, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { activityWeek, dashboardReport, dashboardSpending } from "../../reporting/dashboard";
import { philippineDateTime } from "../../domain/dates";
import {
  HOME_REPORTING_OPTIONS,
  homeReportingPeriod,
  type HomeReportingSelection,
} from "../../reporting/home-reporting";
import {
  DEFAULT_HOME_VISUALIZATIONS,
  type HomeVisualization,
} from "../../reporting/home-visualizations";
import { useFinance } from "../../provider";
import { AccountBalances } from "../accounts/account-balances";
import { CategorySpending } from "./category-spending";
import { IncomeExpenseChart, SpendingTrend } from "./dashboard-charts";
import { HomeMonthPicker } from "./home-month-picker";
import { SelectionSheet } from "../shared/selection-sheet";

import { SpendingActivity } from "./spending-activity";
import { IncomeExpenseSummary } from "./income-expense-summary";
import { DailySpendingSheet } from "./daily-spending-sheet";

/** Owns the shared reporting period and daily selection for all Home visuals. */
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
  const { fontScale, width } = useWindowDimensions();
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

  const paired =
    showActivity && showSummary && width >= 350 && fontScale <= 1.3;
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

  function choosePeriod(value: HomeReportingSelection) {
    setSelection(value);
    setSelectedDate("");
    setDailyOpen(false);
    if (value === "custom") setMonthOpen(true);
  }

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
            <SpendingActivity
              days={days}
              range={range}
              selection={selection}
              paired={paired}
              selectedDate={selectedDate}
              today={today}
              weekDifference={week?.difference}
              onSelectDate={(date) =>
                setSelectedDate((current) => current === date ? "" : date)
              }
              onOpenDaily={() => setDailyOpen(true)}
            />
          ) : null}
          {showSummary && report ? (
            <IncomeExpenseSummary
              income={report.income}
              expenses={report.expenses}
              monthly={monthly}
              paired={paired}
              label={range.label}
            />
          ) : null}
        </View>
      ) : null}
      {dailyOpen ? (
        <DailySpendingSheet
          days={days}
          selectedRecords={selectedRecords}
          selectedDate={selectedDate}
          today={today}
          label={range.label}
          recordLimit={recordLimit}
          onSelectDate={(date) => {
            setSelectedDate((current) => current === date ? "" : date);
            setRecordLimit(10);
          }}
          onShowMore={() => setRecordLimit((value) => value + 10)}
          onClose={() => setDailyOpen(false)}
        />
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
