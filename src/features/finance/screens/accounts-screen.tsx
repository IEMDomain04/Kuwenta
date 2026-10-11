import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { calculateCurrentMoney } from '../calculations';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import { AccountsOverview } from '../components/accounts-overview';
import { FinanceScreen } from '../components/ui';
export default function AccountsScreen() {
  const { accounts, transactions } = useFinance();
  const theme = useTheme();
  let money: ReturnType<typeof calculateCurrentMoney> | undefined;
  let error = '';
  try { money = calculateCurrentMoney(accounts, transactions); }
  catch (cause) { error = cause instanceof Error ? cause.message : 'Could not calculate balances.'; }
  return <FinanceScreen title="Accounts">
    <View style={{ padding: 18, borderRadius: 22, gap: 8, backgroundColor: theme.backgroundElement }}>
      <ThemedText type="small" themeColor="textSecondary">Current balances / All months</ThemedText>
      {money ? <>
        <ThemedText type="smallBold">Available Money</ThemedText>
        <ThemedText style={{ fontSize: 28, lineHeight: 36, fontWeight: '700', color: theme.accent }}>{formatMoney(money.availableMoney)}</ThemedText>
        <ThemedText type="small">Total Money: {formatMoney(money.totalMoney)}</ThemedText>
        {accounts.some((account) => account.archived) ? <ThemedText type="small" themeColor="textSecondary">Archived balances remain included.</ThemedText> : null}
        {money.hasNegativeAccount ? <ThemedText accessibilityRole="alert" type="small">One or more accounts have a negative balance.</ThemedText> : null}
      </> : <ThemedText accessibilityRole="alert">{error}</ThemedText>}
    </View>
    <AccountsOverview />
  </FinanceScreen>;
}
