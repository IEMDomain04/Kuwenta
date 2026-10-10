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
      <ThemedText type="small">{over ? over + ' categories over budget' : 'No categories over budget'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{report.unbudgeted.length} expense categories without budgets</ThemedText>
    </> : <ThemedText type="small" themeColor="textSecondary">Set monthly category limits to track spending.</ThemedText>}
    <ActionButton label="View budgets" disabled={busy} onPress={() => router.push('/budgets')} />
  </View>;
}
