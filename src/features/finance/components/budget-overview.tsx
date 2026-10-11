import { View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { budgetReport } from '../budgets';
import { formatMoney } from '../money';
import { readableReportingMonth } from '../dates';
import { ActionButton } from './ui';

export function BudgetOverview() {
  const { budgets, transactions, month, busy } = useFinance();
  const theme = useTheme();
  const report = budgetReport(budgets, transactions, month);
  const over = report.rows.filter((row) => row.remaining < 0).length;
  return <View style={{ gap: 8, padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement }}>
    <ThemedText type="smallBold">Budgets - {readableReportingMonth(month)}</ThemedText>
    {report.rows.length ? <>
      <ThemedText type="small">Budgeted categories: {formatMoney(report.budgetedSpent)} spent of {formatMoney(report.totalLimit)}</ThemedText>
      <ThemedText type="small" style={{ color: report.remaining < 0 ? theme.expense : theme.income }}>{formatMoney(Math.abs(report.remaining))} {report.remaining < 0 ? 'over budget' : 'remaining'}</ThemedText>
      <View accessibilityRole="progressbar" accessibilityLabel="Monthly budget usage" accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(report.budgetedSpent / report.totalLimit * 100)), text: Math.round(report.budgetedSpent / report.totalLimit * 100) + '% used' }} style={{ height: 8, backgroundColor: theme.backgroundSelected, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ height: 8, width: Math.min(100, report.budgetedSpent / report.totalLimit * 100) + '%' as `${number}%`, backgroundColor: report.remaining < 0 ? theme.expense : theme.income }} />
      </View>
      <ThemedText type="small">{Math.round(report.budgetedSpent / report.totalLimit * 100)}% used</ThemedText>
      <ThemedText type="small">{over ? over + ' categories over budget' : 'No categories over budget'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{report.unbudgeted.length} expense categories without budgets</ThemedText>
    </> : <ThemedText type="small" themeColor="textSecondary">Set monthly category limits to track spending.</ThemedText>}
    <ActionButton label="View budgets" disabled={busy} onPress={() => router.push('/budgets')} />
  </View>;
}
