import { BudgetPeriodPicker } from '../components/budget-period-picker';
import { budgetPeriodKey, budgetPeriodLabel, budgetPeriodRange, isBudgetPeriodKey, type BudgetPeriod } from '../budget-periods';
import { philippineDateTime } from '../dates';
import { BudgetList } from '../components/budget-list';
import { FieldError } from '../components/field-error';
import { type ConfirmationOptions, useConfirmation } from '../components/confirmation';
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { OVERALL_BUDGET, mergeBudgetOrder, BUDGET_CATEGORIES, budgetGroups, budgetReport, validateBudget } from "../budgets";
import { calculateCurrentMoney } from "../calculations";
import { BudgetUsage } from "../components/budget-usage";
import { CategoryIcon, categoryVisual } from "../components/category-visual";
import { MoneyField } from "../components/money-field";
import { SelectionSheet } from "../components/selection-sheet";
import {
  ActionButton,
  BackButton,
  FinanceScreen,
  IconButton,
} from "../components/ui";
import { formatEditableMoney } from "../inputs";
import { formatMoney, moneyInput, parseMoney } from "../money";
import { useFinance } from "../provider";
import { CATEGORIES, type Budget } from "../types";

export default function BudgetsScreen() {
  const params = useLocalSearchParams<{ add?: string; category?: string; scope?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const confirmation = useConfirmation();
  const { budgets, transactions, busy } = finance;
  const initialScope = typeof params.scope === 'string' && isBudgetPeriodKey(params.scope) ? params.scope : undefined;
  const [period, setPeriod] = useState<BudgetPeriod | 'all'>(() => initialScope ? budgetPeriodRange(initialScope).period : 'all');
  useEffect(() => { if (initialScope) { const range = budgetPeriodRange(initialScope); setPeriod(range.period); if (range.period === 'monthly') finance.setMonth(initialScope); } }, [initialScope]);
  const today = philippineDateTime().transactionDate;
  const month = budgetPeriodKey(period === 'all' ? 'daily' : period, today);
  const groups = useMemo(() => budgetGroups(budgets, transactions, period), [budgets, transactions, period]);
  const report = useMemo(() => budgetReport(budgets, transactions, month), [budgets, transactions, month]);
  const available = useMemo(() => calculateCurrentMoney(finance.accounts, transactions).availableMoney, [finance.accounts, transactions]);
  const [editor, setEditor] = useState<{
    category: string;
    amount: string;
    creating: boolean;
    month: string;
    original?: Budget;
  } | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
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
    const existing = budgets.find(
      (row) => row.month === (initialScope ?? month) && row.category === params.category,
    );
    const unusedCategory = BUDGET_CATEGORIES.find(
      (category) => !report.rows.some((row) => row.category === category),
    );
    setEditor((current) => current?.creating && !existing && unusedCategory ? { ...current, category: report.rows.some(row => row.category === current.category) ? unusedCategory : current.category } :
      existing
        ? {
            month: existing.month,
            original: existing,
            category: existing.category,
            amount: formatEditableMoney(moneyInput(existing.limitAmount))!,
            creating: false,
          }
        : params.add === "1" && unusedCategory
          ? { category: unusedCategory, amount: "", creating: true, month }
          : null,
    );
    setCategoryOpen(false);
    setFieldErrors({});
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
    summary: ConfirmationOptions = {},
  ) {
    if (locked || pending.current) return;
    pending.current = true;
    Keyboard.dismiss();
    confirmation.alert(
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
      { ...summary, icon: destructive ? "trash-outline" : "pie-chart-outline" },
    );
  }
  function save() {
    if (!editor || locked || pending.current || rejected) return;
    let budget: Budget;
    try {
      budget = {
        month: editor.month,
        category: editor.category,
        limitAmount: parseMoney(editor.amount.replace(/,/g, "")),
      };
      validateBudget(budget);
      budgetReport(
        [
          ...budgets.filter(
            (row) => row.month !== budget.month || row.category !== budget.category,
          ),
          budget,
        ],
        transactions,
        budget.month,
      );
    } catch (cause) {
      setFieldErrors({ amount: cause instanceof Error ? cause.message : "Invalid budget." });
      setError(cause instanceof Error ? cause.message : "Invalid budget.");
      amountInput.current?.focus();
      return;
    }
    const creating = editor.creating;
    const original = editor.original;
    const moved = original && original.month !== budget.month;
    if (creating || original && !moved && original.limitAmount === budget.limitAmount) {
      pending.current = true;
      void perform(() => finance.saveBudget(budget, creating, original));
    } else if (original) {
      confirm(
        'Save budget changes?',
        moved ? 'Moves this budget to the selected period. Recorded expenses stay unchanged.' : 'Updates this spending limit. Recorded expenses stay unchanged.',
        () => finance.saveBudget(budget, false, original),
        false,
        { rows: [{ label: 'Category', value: budget.category }, { label: 'Period', value: budgetPeriodLabel(budget.month) }, { label: 'Limit', value: formatMoney(budget.limitAmount) }], change: moved ? { label: 'Budget period', before: budgetPeriodLabel(original.month), after: budgetPeriodLabel(budget.month) } : { label: 'Budget limit', before: formatMoney(original.limitAmount), after: formatMoney(budget.limitAmount) } },
      );
    }
  }

  function renderBudget(row: ReturnType<typeof budgetReport>['rows'][number], totalRemaining: number, current: boolean, onHold?: (event: import('react-native').GestureResponderEvent) => void) {
    return (
      <View
        key={row.category}
        style={{
          gap: 8,
        }}
      >
        <BudgetUsage
          row={row}
          onHold={onHold}
          available={available}
          totalRemaining={totalRemaining}
          currentMonth={current}
          actions={
            <View style={{ flexDirection: "row", gap: 4 }}>
              <IconButton
                icon="pencil-outline"
                label={"Edit " + row.category + " budget"}
                disabled={locked}
                onPress={() => {
                  setEditor({
                    month: row.month,
                    original: row,
                    category: row.category,
                    amount: formatEditableMoney(
                      moneyInput(row.limitAmount),
                    )!,
                    creating: false,
                  });
                  setFieldErrors({});
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
                      budgetPeriodLabel(row.month) +
                      "? Your expenses are kept.",
                    () => finance.removeBudget(row.month, row.category),
                    true,
                    { rows: [{ label: 'Category', value: row.category }, { label: 'Period', value: budgetPeriodLabel(row.month) }, { label: 'Limit', value: formatMoney(row.limitAmount) }] },
                  )
                }
              />
            </View>
          }
        />
      </View>
    );
  }

  const unused = BUDGET_CATEGORIES.filter(
    (category) => !budgets.some((row) => row.month === (editor?.month ?? month) && row.category === category),
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <FinanceScreen
        title="Budgets"
        scrollEnabled={!dragging}
        tabScreen={false}
        headerLeading={<BackButton disabled={locked} />}
        headerAccessory={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>

            {!editor ? (
              <ActionButton
                compact
                primary
                icon="add"
                label="Add"
                disabled={locked || unused.length === 0}
                onPress={() => {
                  setEditor({
                    month,
                    category: unused[0],
                    amount: "",
                    creating: true,
                  });
                  setRejected(false);
                  setFieldErrors({});
                setError("");
                }}
              />
            ) : null}
          </View>
        }
      >
        {!editor ? <BudgetPeriodPicker period={period} date={today} disabled={locked} onPeriodChange={setPeriod} allowAll showDate={false} /> : null}
        {!editor ? (
          <>
            {groups.map(group => <View key={group.scope} style={{ gap: 10 }}>
              <ThemedText type="smallBold">{group.period === 'daily' ? 'Daily' : group.period === 'weekly' ? 'Weekly' : 'Monthly'} | {budgetPeriodLabel(group.scope)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{formatMoney(group.budgetedSpent, true)} spent of {formatMoney(group.totalLimit, true)} | {formatMoney(Math.abs(group.remaining), true)} {group.remaining < 0 ? 'over budget' : 'remaining'}</ThemedText>
            {group.rows.filter(row => row.category === OVERALL_BUDGET).map(row => <View key={row.category}>{renderBudget(row, group.positiveRemaining, group.start <= today && group.end >= today)}</View>)}
            {group.rows.some(row => row.category === OVERALL_BUDGET) && group.rows.some(row => row.category !== OVERALL_BUDGET) ? <ThemedText type="smallBold">Category limits</ThemedText> : null}
            <BudgetList key={group.scope + JSON.stringify(group.rows.map(row => row.category))} rows={group.rows.filter(row => row.category !== OVERALL_BUDGET)} disabled={locked} onDraggingChange={setDragging} onReorder={categories => finance.saveBudgetOrder(group.scope, mergeBudgetOrder(group.rows.map(row => row.category), categories))} renderRow={(row, onHold) => renderBudget(row, group.positiveRemaining, group.start <= today && group.end >= today, onHold)} />
            </View>)}
            {groups.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No budgets yet. Tap Add to set a spending limit.
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
              {budgetPeriodLabel(editor.month)}
            </ThemedText>
            <ThemedText type="small">Spending covered</ThemedText>
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
            <ThemedText type="small">Budget limit (PHP)</ThemedText>
            <FieldError message={fieldErrors.amount} />
            <MoneyField
              ref={amountInput}
              accessibilityLabel="Budget limit in pesos"
              autoFocus
              value={editor.amount}
              editable={!locked}
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
              onValueChange={(amount) => {
                setEditor({ ...editor, amount });
                setRejected(false);
                setFieldErrors({});
                setError("");
              }}
              onRejected={() => {
                setFieldErrors({ amount: "Use digits and up to two decimal places." });
                setRejected(true);
                setError("Use digits and up to two decimal places.");
              }}
              style={{
                color: theme.text,
                fontSize: 22,
                padding: 12,
                borderWidth: 1,
                borderColor: fieldErrors.amount ? theme.error : theme.border,
                borderRadius: 12,
              }}
            />
            <ThemedText type="small">Budget period</ThemedText>
            <BudgetPeriodPicker period={budgetPeriodRange(editor.month).period} date={budgetPeriodRange(editor.month).start} disabled={locked}
              onPeriodChange={value => { if (value === 'all') return; setEditor({ ...editor, month: editor.original && budgetPeriodRange(editor.original.month).period === value ? editor.original.month : budgetPeriodKey(value, today) }); setFieldErrors({}); }} />
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
                  setFieldErrors({});
                setError("");
                }
              }}
            />
          </View>
        )}
        <SelectionSheet
          visible={categoryOpen && Boolean(editor)}
          title="Spending covered"
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
                Spending without a budget ({report.unbudgeted.length}) | {budgetPeriodLabel(month)}
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
                  No spending outside your budgets.
                </ThemedText>
              )
            ) : null}
          </>
        ) : null}
      </FinanceScreen>
    </KeyboardAvoidingView>
  );
}
