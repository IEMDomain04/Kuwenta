import { BudgetUsage } from './budget-usage';
import { calculateCurrentMoney } from '../calculations';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { CATEGORIES } from '../types';
import { budgetReport } from '../budgets';
import { formatMoney } from '../money';
import { philippineDateTime, readableReportingMonth } from '../dates';
import { ActionButton } from './ui';

import { Ionicons } from '@react-native-vector-icons/ionicons';

export function BudgetOverview({ compact = false, reportingMonth }: { compact?: boolean; reportingMonth?: string }) {
  const finance = useFinance();
  const theme = useTheme();
  const month = reportingMonth ?? philippineDateTime().transactionDate.slice(0, 7);
  const report = budgetReport(finance.budgets, finance.transactions, month);
  const totalRemaining = report.rows.reduce((sum, item) => sum + Math.max(0, item.remaining), 0);
  const available = calculateCurrentMoney(finance.accounts, finance.transactions).availableMoney;
  if (compact && !report.rows.length) return null;
  function openBudget(category?: string, add = false) {
    finance.setMonth(month);
    router.push({ pathname: '/budgets', params: { ...(category ? { category } : {}), ...(add ? { add: '1' } : {}) } });
  }
  return (
    <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="pie-chart-outline" size={16} color={theme.budget} />
        <ThemedText type="smallBold" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: theme.budget, fontSize: 12, lineHeight: 18, flexShrink: 1 }}>{compact ? "This month's budget" : 'Budgets'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontSize: 10, lineHeight: 16, marginLeft: 'auto' }}>{readableReportingMonth(month)}</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {report.rows.length ? <ThemedText type="small" style={{ flex: 1, fontSize: 11, lineHeight: 16 }}>{formatMoney(report.budgetedSpent, true)} spent of {formatMoney(report.totalLimit, true)}</ThemedText> : <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>Add a monthly category limit to track your spending.</ThemedText>}
        <ActionButton compact label="Manage" disabled={finance.busy} onPress={() => openBudget()} />
      </View>
      {(compact ? report.rows.slice(0, 3) : report.rows).map((row, index) => <View key={row.category} style={{ paddingTop: index === 0 ? 4 : 12, paddingBottom: 4, ...(index > 0 ? { borderTopWidth: 1, borderColor: theme.border } : {}) }}>
        <BudgetUsage row={row} available={available} totalRemaining={totalRemaining} currentMonth={month === finance.currentMonth} />
      </View>)}
      {compact && report.rows.length > 3 ? <ThemedText type="small" themeColor="textSecondary">{report.rows.length - 3} more categories in Manage.</ThemedText> : null}
      {!compact ? <ActionButton compact primary label="Add budget" disabled={finance.busy || CATEGORIES.EXPENSE.every(category => report.rows.some(row => row.category === category))} onPress={() => openBudget(undefined, true)} /> : null}
    </View>
  );
}
