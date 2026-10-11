import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { calculateCurrentMoney } from '../calculations';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import { AccountsOverview } from '../components/accounts-overview';
import { FinanceScreen } from '../components/ui';
export default function AccountsScreen() {
  const { accounts, transactions, busy } = useFinance();
  const theme = useTheme();
  let money: ReturnType<typeof calculateCurrentMoney> | undefined;
  let error = '';
  try { money = calculateCurrentMoney(accounts, transactions); }
  catch (cause) { error = cause instanceof Error ? cause.message : 'Could not calculate balances.'; }
  return <FinanceScreen title="Accounts">
    <View style={{ padding: 18, borderRadius: 22, gap: 8, backgroundColor: theme.backgroundElement }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14 }} themeColor="textSecondary">Current balances / All months</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Add account" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => router.push('/account')} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.incomeSurface, opacity: pressed || busy ? 0.5 : 1 })}>
          <Ionicons name="add" size={16} color={theme.accent} /><ThemedText type="smallBold" style={{ fontSize: 11, lineHeight: 16 }} themeColor="accent">Add Account</ThemedText>
        </Pressable>
      </View>
      {money ? <>
        <ThemedText type="smallBold">Total Money</ThemedText>
        <ThemedText style={{ fontSize: 24, lineHeight: 32, fontWeight: '700', color: theme.accent }}>{formatMoney(money.totalMoney)}</ThemedText>
        <ThemedText type="small" style={{ fontSize: 11, lineHeight: 16 }}>Available Money: {formatMoney(money.availableMoney)}</ThemedText>
        {accounts.some((account) => account.archived) ? <ThemedText type="small" themeColor="textSecondary">Archived balances remain included.</ThemedText> : null}
        {money.hasNegativeAccount ? <ThemedText accessibilityRole="alert" type="small">One or more accounts have a negative balance.</ThemedText> : null}
      </> : <ThemedText accessibilityRole="alert" style={{ color: theme.error, backgroundColor: theme.errorSurface }}>{error}</ThemedText>}
    </View>
    {money ? <View style={{ padding: 14, borderRadius: 20, backgroundColor: theme.incomeSurface, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="bulb-outline" size={18} color={theme.accent} /><ThemedText type="smallBold" style={{ fontSize: 12, lineHeight: 17 }}>Account insight</ThemedText></View>
        <View><ThemedText type="small" style={{ fontSize: 11, lineHeight: 16 }}>{money.hasNegativeAccount ? 'An account has a negative balance. Review its records or adjust the balance if it needs a correction.' : accounts.filter((account) => !account.archived).length + ' active accounts. Only accounts marked for Available Money contribute to it.'}</ThemedText></View>
    </View> : null}
    <AccountsOverview showAdd={false} />
  </FinanceScreen>;
}
