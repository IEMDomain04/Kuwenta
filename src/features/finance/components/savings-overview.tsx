import { Ionicons } from '@react-native-vector-icons/ionicons';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { calculateSavings, calculateGoalProgress } from '../calculations';
import { formatMoney } from '../money';
import { readableReportingMonth, formatTransactionDateTime } from '../dates';
import { ActionButton, IconButton } from './ui';

export function SavingsOverview({ compact = false, goalsOnly = false, reportingMonth }: { compact?: boolean; goalsOnly?: boolean; reportingMonth?: string }) {
  const { accounts, transactions, goals, month: selectedMonth, busy } = useFinance();
  const theme = useTheme();
  const month = reportingMonth ?? selectedMonth;
  let savings: ReturnType<typeof calculateSavings> | undefined;
  let error = '';
  try { savings = calculateSavings(accounts, transactions, month); }
  catch (cause) { error = cause instanceof Error ? cause.message : 'Could not calculate savings.'; }
  return <>
    {!goalsOnly && <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="wallet-outline" size={18} color={theme.income} /><ThemedText type="smallBold" accessibilityRole="header" style={{ color: theme.income }}>Savings</ThemedText></View>
      {savings ? <>
        <ThemedText type="small" themeColor="textSecondary">Current savings balance | All months</ThemedText>
        <ThemedText style={{ fontSize: 22, fontWeight: '700' }}>{formatMoney(savings.balance)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{readableReportingMonth(month)}</ThemedText>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <ThemedText type="small">Moved into savings</ThemedText><ThemedText type="smallBold">{formatMoney(savings.movedIntoSavings)}</ThemedText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <ThemedText type="small">Moved out of savings</ThemedText><ThemedText type="smallBold">{formatMoney(savings.movedOutOfSavings)}</ThemedText>
        </View>
        {savings.balance < 0 && <ThemedText accessibilityRole="alert" style={{ color: theme.warning, backgroundColor: theme.warningSurface }}>Warning: the savings balance is negative.</ThemedText>}
        {savings.usesLegacyPurposes && <ThemedText type="small" themeColor="textSecondary">Older transfers use current account purposes for this report.</ThemedText>}
      </> : <ThemedText accessibilityRole="alert" style={{ color: theme.error, backgroundColor: theme.errorSurface }}>{error}</ThemedText>}
    </View>}
    <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="flag-outline" size={18} color={theme.income} /><ThemedText type="smallBold" accessibilityRole="header" style={{ color: theme.income }}>Savings goals</ThemedText></View>
        {compact && <ActionButton compact label="View all" disabled={busy} onPress={() => router.push("/goals")} />}
        <ActionButton compact label="Add goal" disabled={busy} onPress={() => router.push('/goal')} />
      </View>
      {goals.length === 0 && <ThemedText type="small" themeColor="textSecondary">Set a target for a dedicated savings account.</ThemedText>}
      {(compact ? goals.slice(0, 2) : goals).map((goal) => {
        const account = accounts.find((row) => row.id === goal.accountId)!;
        let progress: ReturnType<typeof calculateGoalProgress>;
        try { progress = calculateGoalProgress(goal, accounts, transactions); }
        catch (cause) { return <ThemedText key={goal.id} accessibilityRole="alert">{goal.name}: {cause instanceof Error ? cause.message : 'Could not calculate progress.'}</ThemedText>; }
        return <View key={goal.id} style={{ gap: 8, borderTopWidth: 1, borderColor: theme.border, paddingTop: 12 }}>
          <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail">{goal.name}</ThemedText>
          <ThemedText type="small" numberOfLines={1} ellipsizeMode="tail" themeColor="textSecondary">{account.name}{account.archived ? ' | Archived' : ''}{goal.targetDate ? ' | Target ' + formatTransactionDateTime(goal.targetDate, '00:00:00').split(' · ')[0] : ''}</ThemedText>
          <ThemedText type="small">{formatMoney(progress.balance)} of {formatMoney(goal.targetAmount)}</ThemedText>
          <View accessibilityRole="progressbar" accessibilityLabel={goal.name + ' progress'} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.progress * 100) }} style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.incomeSurface }}>
            <View style={{ height: 8, backgroundColor: theme.income, width: ((progress.progress * 100) + '%') as `${number}%` }} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">{progress.achieved ? 'Target reached' : Math.round(progress.progress * 100) + '% saved / ' + formatMoney(progress.remaining) + ' remaining'}</ThemedText>
          {progress.balance < 0 && <ThemedText accessibilityRole="alert" style={{ color: theme.warning, backgroundColor: theme.warningSurface }}>Warning: this savings account has a negative balance.</ThemedText>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ActionButton compact primary label="Add money" disabled={busy || account.archived || !accounts.some((row) => !row.archived && row.id !== account.id)}
              onPress={() => router.push({ pathname: '/transfer', params: { type: 'TRANSFER', destinationAccountId: account.id } })} />
            <IconButton icon="pencil-outline" label={'Edit goal ' + goal.name} disabled={busy} onPress={() => router.push({ pathname: '/goal', params: { id: goal.id } })} />
          </View>
        </View>;
      })}
      {compact && goals.length > 2 && <ThemedText type="small" themeColor="textSecondary">{goals.length - 2} more goals in View all.</ThemedText>}
    </View>
  </>;
}
