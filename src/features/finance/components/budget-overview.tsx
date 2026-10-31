import { useAmountVisibility } from '@/hooks/amount-visibility';
import { BudgetPeriodPicker } from './budget-period-picker';
import { budgetPeriodKey, budgetPeriodLabel, budgetPeriodRange, type BudgetPeriod } from '../budget-periods';
import { useMemo, useState } from 'react';
import { BudgetList } from './budget-list';
import { BudgetUsage } from './budget-usage';
import { calculateCurrentMoney } from '../calculations';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { CATEGORIES } from '../types';
import { OVERALL_BUDGET, BUDGET_CATEGORIES, budgetGroups, mergeBudgetOrder } from '../budgets';
import { philippineDateTime } from '../dates';
import { ActionButton } from './ui';

import { Ionicons } from '@react-native-vector-icons/ionicons';

export function BudgetOverview({ compact = false, reportingMonth, onDraggingChange }: { compact?: boolean; reportingMonth?: string; onDraggingChange?: (dragging: boolean) => void }) {
  const finance = useFinance();
  const theme = useTheme();
  const { formatAmount: formatMoney } = useAmountVisibility();
  const today = finance.currentDate ?? philippineDateTime().transactionDate;
  const [period, setPeriod] = useState<BudgetPeriod | 'all'>('all');
  const selectedMonth = reportingMonth ?? today.slice(0, 7);
  const date = today;
  const month = budgetPeriodKey(period === 'all' ? 'daily' : period, today);
  const groups = useMemo(() => budgetGroups(finance.budgets, finance.transactions, period, today), [finance.budgets, finance.transactions, period, today]);
  const available = useMemo(() => calculateCurrentMoney(finance.accounts, finance.transactions).availableMoney, [finance.accounts, finance.transactions]);
  if (compact && !finance.budgets.length) return null;
  function openBudget(category?: string, add = false) {
    finance.setMonth(selectedMonth);
    router.push({ pathname: '/budgets', params: { ...(period === 'all' && !add ? {} : { scope: month }), ...(category ? { category } : {}), ...(add ? { add: '1' } : {}) } });
  }
  return (
    <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="pie-chart-outline" size={16} color={theme.budget} />
        <ThemedText type="smallBold" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: theme.budget, fontSize: 12, lineHeight: 18, flexShrink: 1 }}>{compact ? period === 'all' ? 'Budgets' : period === 'monthly' ? 'Monthly budgets' : period === 'weekly' ? 'Weekly budgets' : 'Daily budgets' : 'Budgets'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontSize: 10, lineHeight: 16, marginLeft: 'auto' }}>Current periods</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <BudgetPeriodPicker period={period} date={date} disabled={finance.busy} onPeriodChange={setPeriod} allowAll showDate={false} />
        </View>
        <ActionButton compact label="Manage" disabled={finance.busy} onPress={() => openBudget()} />
      </View>
      {groups.map(group => <View key={group.scope} style={{ gap: 8 }}>
        <ThemedText type="smallBold">{group.period === 'daily' ? 'Daily' : group.period === 'weekly' ? 'Weekly' : 'Monthly'} | {budgetPeriodLabel(group.scope)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{formatMoney(group.budgetedSpent, true)} spent of {formatMoney(group.totalLimit, true)}</ThemedText>
        {group.rows.filter(row => row.category === OVERALL_BUDGET).map(row => <BudgetUsage key={row.category} row={row} available={available} totalRemaining={group.positiveRemaining} currentMonth={group.start <= today && group.end >= today} />)}
        {group.rows.some(row => row.category !== OVERALL_BUDGET) && group.rows.some(row => row.category === OVERALL_BUDGET) ? <ThemedText type="smallBold">Category limits</ThemedText> : null}
        <BudgetList key={group.scope + JSON.stringify(group.rows.map(row => row.category))} rows={group.rows.filter(row => row.category !== OVERALL_BUDGET)} disabled={finance.busy} onDraggingChange={onDraggingChange}
          onReorder={categories => finance.saveBudgetOrder(group.scope, mergeBudgetOrder(group.rows.map(row => row.category), categories))}
          renderRow={(row, onHold) => <BudgetUsage row={row} onHold={onHold} available={available} totalRemaining={group.positiveRemaining} currentMonth={group.start <= today && group.end >= today} />} />
      </View>)}
      {finance.budgets.some(budget => budgetPeriodRange(budget.month).end < today) ? <ActionButton compact label="Budget history" disabled={finance.busy} onPress={() => router.push({ pathname: '/budgets', params: { history: '1' } })} /> : null}
      {!groups.length ? <ThemedText type="small" themeColor="textSecondary">No budgets for this period.</ThemedText> : null}
      {!compact ? <ActionButton compact primary label="Add budget" disabled={finance.busy || BUDGET_CATEGORIES.every(category => finance.budgets.some(row => row.month === month && row.category === category))} onPress={() => openBudget(undefined, true)} /> : null}
    </View>
  );
}
