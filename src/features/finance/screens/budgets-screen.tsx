import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { budgetReport, validateBudget } from "../budgets";
import { calculateCurrentMoney } from "../calculations";
import { BudgetUsage } from "../components/budget-usage";
import { CategoryIcon, categoryVisual } from "../components/category-visual";
import { HomeMonthPicker } from "../components/home-month-picker";
import { MoneyField } from "../components/money-field";
import { SelectionSheet } from "../components/selection-sheet";
import {
  ActionButton,
  BackButton,
  FinanceScreen,
  IconButton,
} from "../components/ui";
import { readableReportingMonth } from "../dates";
import { formatEditableMoney } from "../inputs";
import { formatMoney, moneyInput, parseMoney } from "../money";
import { useFinance } from "../provider";
import { CATEGORIES, type Budget } from "../types";

export default function BudgetsScreen() {
  const params = useLocalSearchParams<{ add?: string; category?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const { month, budgets, transactions, busy } = finance;
  const report = budgetReport(budgets, transactions, month);
  const available = calculateCurrentMoney(
    finance.accounts,
    transactions,
  ).availableMoney;
  const [editor, setEditor] = useState<{
    category: string;
    amount: string;
    creating: boolean;
  } | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [unbudgetedOpen, setUnbudgetedOpen] = useState(false);
  function setError(message: string) {
    if (message) finance.showNotice(message, true);
  }
  const [rejected, setRejected] = useState(false);
  const [working, setWorking] = useState(false);
  const amountInput = useRef<TextInput>(null);
  const pending = useRef(false);
  const locked = busy || working;
  useEffect(() => {
    const listener = BackHandler.addEventListener(
      "hardwareBackPress",
      () => pending.current || locked,
    );
    return () => listener.remove();
  }, [locked]);
  useEffect(() => {
    const existing = report.rows.find(
      (row) => row.category === params.category,
    );
    const unusedCategory = CATEGORIES.EXPENSE.find(
      (category) => !report.rows.some((row) => row.category === category),
    );
    setEditor(
      existing
        ? {
            category: existing.category,
            amount: formatEditableMoney(moneyInput(existing.limitAmount))!,
            creating: false,
          }
        : params.add === "1" && unusedCategory
          ? { category: unusedCategory, amount: "", creating: true }
          : null,
    );
    setCategoryOpen(false);
    setError("");
    setRejected(false);
    // Route intent initializes the editor; saving does not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, params.add, params.category]);
  async function perform(operation: () => Promise<void>) {
    setWorking(true);
    setError("");
    try {
      await operation();
      setEditor(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update budgets.",
      );
    } finally {
      pending.current = false;
      setWorking(false);
    }
  }
  function confirm(
    title: string,
    message: string,
    operation: () => Promise<void>,
    destructive = false,
  ) {
    if (locked || pending.current) return;
    pending.current = true;
    Keyboard.dismiss();
    Alert.alert(
      title,
      message,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            pending.current = false;
          },
        },
        {
          text: destructive ? "Delete" : "Confirm",
          style: destructive ? "destructive" : "default",
          onPress: () => {
            void perform(operation);
          },
        },
      ],
      { cancelable: false },
    );
  }
  function save() {
    if (!editor || locked || pending.current || rejected) return;
    let budget: Budget;
    try {
      budget = {
        month,
        category: editor.category,
        limitAmount: parseMoney(editor.amount.replace(/,/g, "")),
      };
      validateBudget(budget);
      budgetReport(
        [
          ...budgets.filter(
            (row) => row.month !== month || row.category !== budget.category,
          ),
          budget,
        ],
        transactions,
        month,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid budget.");
      amountInput.current?.focus();
      return;
    }
    const creating = editor.creating;
    if (creating) {
      pending.current = true;
      void perform(() => finance.saveBudget(budget, true));
    } else
      confirm(
        "Save budget changes?",
        budget.category +
          " for " +
          readableReportingMonth(month) +
          ": " +
          formatMoney(budget.limitAmount) +
          ". Transactions remain unchanged.",
        () => finance.saveBudget(budget, false),
      );
  }
  const unused = CATEGORIES.EXPENSE.filter(
    (category) => !report.rows.some((row) => row.category === category),
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <FinanceScreen
        title="Budgets"
        tabScreen={false}
        headerLeading={<BackButton disabled={locked} />}
        headerAccessory={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <HomeMonthPicker />
            {!editor ? (
              <ActionButton
                compact
                primary
                icon="add"
                label="Add"
                disabled={locked || unused.length === 0}
                onPress={() => {
                  setEditor({
                    category: unused[0],
                    amount: "",
                    creating: true,
                  });
                  setRejected(false);
                  setError("");
                }}
              />
            ) : null}
          </View>
        }
      >
        {!editor ? (
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              padding: 14,
              borderRadius: 16,
              backgroundColor: theme.backgroundElement,
            }}
          >
            {[
              ["Total limit", report.totalLimit],
              ["Spent", report.budgetedSpent],
              [
                report.remaining < 0 ? "Over budget" : "Remaining",
                Math.abs(report.remaining),
              ],
            ].map(([label, amount]) => (
              <View key={label} style={{ flex: 1, gap: 4 }}>
                <ThemedText type="small" themeColor="textSecondary">
                  {label}
                </ThemedText>
                <ThemedText
                  type="smallBold"
                  style={{
                    fontSize: 14,
                    color: label === "Over budget" ? theme.expense : theme.text,
                  }}
                >
                  {formatMoney(amount as number, true)}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}
        {!editor ? (
          <>
            {report.rows.map((row) => (
              <View
                key={row.category}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: theme.backgroundElement,
                  gap: 8,
                }}
              >
                <BudgetUsage
                  row={row}
                  available={available}
                  totalRemaining={report.rows.reduce(
                    (sum, item) => sum + Math.max(0, item.remaining),
                    0,
                  )}
                  currentMonth={month === finance.currentMonth}
                  actions={
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      <IconButton
                        icon="pencil-outline"
                        label={"Edit " + row.category + " budget"}
                        disabled={locked}
                        onPress={() => {
                          setEditor({
                            category: row.category,
                            amount: formatEditableMoney(
                              moneyInput(row.limitAmount),
                            )!,
                            creating: false,
                          });
                          setError("");
                          setRejected(false);
                        }}
                      />
                      <IconButton
                        icon="trash-outline"
                        destructive
                        label={"Delete " + row.category + " budget"}
                        disabled={locked}
                        onPress={() =>
                          confirm(
                            "Delete budget?",
                            "Remove " +
                              row.category +
                              " budget for " +
                              readableReportingMonth(month) +
                              "? Your expenses are kept.",
                            () => finance.removeBudget(month, row.category),
                            true,
                          )
                        }
                      />
                    </View>
                  }
                />
              </View>
            ))}
            {report.rows.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No budgets yet. Tap Add to set a category limit.
              </ThemedText>
            ) : null}
          </>
        ) : null}
        {editor && (
          <View
            style={{
              gap: 10,
              padding: 14,
              borderRadius: 16,
              backgroundColor: theme.backgroundElement,
            }}
          >
            <ThemedText type="smallBold">
              {editor.creating ? "Add budget" : "Edit budget"} -{" "}
              {readableReportingMonth(month)}
            </ThemedText>
            <ThemedText type="small">Category</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Budget category"
              disabled={locked || !editor.creating}
              onPress={() => {
                Keyboard.dismiss();
                setCategoryOpen(true);
              }}
              style={{
                minHeight: 48,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CategoryIcon category={editor.category} compact />
              <ThemedText type="small" numberOfLines={2} style={{ flex: 1 }}>
                {editor.category}
              </ThemedText>
              {editor.creating ? (
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={theme.textSecondary}
                />
              ) : null}
            </Pressable>
            <ThemedText type="small">Monthly limit (PHP)</ThemedText>
            <MoneyField
              ref={amountInput}
              accessibilityLabel="Monthly budget limit in pesos"
              autoFocus
              value={editor.amount}
              editable={!locked}
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
              onValueChange={(amount) => {
                setEditor({ ...editor, amount });
                setRejected(false);
                setError("");
              }}
              onRejected={() => {
                setRejected(true);
                setError("Use digits and up to two decimal places.");
              }}
              style={{
                color: theme.text,
                fontSize: 22,
                padding: 12,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
              }}
            />
            <ActionButton
              primary
              label={working ? "Saving..." : "Save"}
              disabled={locked || rejected}
              onPress={save}
            />
            <ActionButton
              label="Cancel"
              disabled={locked}
              onPress={() => {
                if (!pending.current) {
                  setEditor(null);
                  setError("");
                }
              }}
            />
          </View>
        )}
        <SelectionSheet
          visible={categoryOpen && Boolean(editor)}
          title="Budget category"
          options={unused.map((category) => ({
            value: category,
            label: category,
            icon: categoryVisual(category).icon,
          }))}
          selected={editor?.category}
          disabled={locked}
          onClose={() => setCategoryOpen(false)}
          onSelect={(category) =>
            setEditor((current) => (current ? { ...current, category } : null))
          }
        />

        {!editor ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: unbudgetedOpen }}
              onPress={() => setUnbudgetedOpen((value) => !value)}
              style={{
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ThemedText type="smallBold" style={{ flex: 1 }}>
                Spending without a budget ({report.unbudgeted.length})
              </ThemedText>
              <Ionicons
                name={unbudgetedOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color={theme.textSecondary}
              />
            </Pressable>
            {unbudgetedOpen ? (
              report.unbudgeted.length ? (
                report.unbudgeted.map((row) => (
                  <View
                    key={row.category}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <CategoryIcon category={row.category} compact />
                    <ThemedText type="small" style={{ flex: 1 }}>
                      {row.category}
                    </ThemedText>
                    <ThemedText type="small">
                      {formatMoney(row.amount, true)}
                    </ThemedText>
                  </View>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  No spending outside budgeted categories.
                </ThemedText>
              )
            ) : null}
          </>
        ) : null}
      </FinanceScreen>
    </KeyboardAvoidingView>
  );
}
