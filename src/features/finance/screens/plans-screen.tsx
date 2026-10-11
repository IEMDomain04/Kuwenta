import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { CATEGORIES } from '../types';
import { budgetReport } from '../budgets';
import { formatMoney } from '../money';
import { philippineDateTime, readableReportingMonth } from '../dates';
import { SavingsOverview } from '../components/savings-overview';
import { ActionButton, FinanceScreen } from '../components/ui';

export default function PlansScreen() {
  const finance = useFinance();
  const theme = useTheme();
  const month = philippineDateTime().transactionDate.slice(0, 7);
  const report = budgetReport(finance.budgets, finance.transactions, month);
  function openBudget(category?: string, add = false) {
    finance.setMonth(month);
    router.push({ pathname: '/budgets', params: { ...(category ? { category } : {}), ...(add ? { add: '1' } : {}) } });
  }
  return <FinanceScreen title="Plans">
    <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <ThemedText type="smallBold" accessibilityRole="header">Budgets</ThemedText>
        <ActionButton compact label="Manage" disabled={finance.busy} onPress={() => openBudget()} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">{readableReportingMonth(month)}</ThemedText>
      {report.rows.length ? <ThemedText type="small">{formatMoney(report.budgetedSpent)} spent of {formatMoney(report.totalLimit)}</ThemedText> : <ThemedText type="small" themeColor="textSecondary">Add a monthly category limit to track your spending.</ThemedText>}
      {report.rows.map((row) => <Pressable key={row.category} accessibilityRole="button" accessibilityLabel={'Edit ' + row.category + ' budget'} disabled={finance.busy} onPress={() => openBudget(row.category)} style={{ minHeight: 48, paddingVertical: 10, borderTopWidth: 1, borderColor: theme.border, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <ThemedText type="smallBold">{row.category}</ThemedText>
          <ThemedText type="small">{formatMoney(row.spent)} / {formatMoney(row.limitAmount)}</ThemedText>
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel={row.category + ' usage'} accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(row.progress * 100)), text: Math.round(row.progress * 100) + '% used' }} style={{ height: 6, borderRadius: 3, backgroundColor: theme.incomeSurface, overflow: 'hidden' }}>
          <View style={{ height: 6, width: `${Math.min(1, row.progress) * 100}%`, backgroundColor: row.remaining < 0 ? theme.expense : theme.income }} />
        </View>
        <ThemedText type="small" style={{ color: row.remaining < 0 ? theme.expense : theme.textSecondary }}>{row.remaining < 0 ? 'Over by ' : 'Remaining '}{formatMoney(Math.abs(row.remaining))}</ThemedText>
      </Pressable>)}
      <ActionButton compact primary label="Add budget" disabled={finance.busy || report.rows.length >= CATEGORIES.EXPENSE.length} onPress={() => openBudget(undefined, true)} />
    </View>
    <SavingsOverview reportingMonth={month} />
  </FinanceScreen>;
}
