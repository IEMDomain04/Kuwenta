import { useState } from 'react';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { calculateCurrentMoney, calculateAccountSummary, calculateSavings } from '../calculations';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import { AccountsOverview } from '../components/accounts-overview';
import { FinanceScreen, AddTransactionButton } from '../components/ui';
export default function AccountsScreen() {
  const { accounts, transactions, busy } = useFinance();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [dragging, setDragging] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  let accountInsight = '';
  let negativeAccounts: string[] = [];
  let money: ReturnType<typeof calculateCurrentMoney> | undefined;
  let error = '';
  try {
    money = calculateCurrentMoney(accounts, transactions);
    negativeAccounts = accounts.filter((account) => calculateAccountSummary(account, transactions, '1900-01').balance < 0).map((account) => account.name);
    const savings = calculateSavings(accounts, transactions, '1900-01').balance;
    accountInsight = negativeAccounts.length ? negativeAccounts.join(', ') + (negativeAccounts.length > 1 ? ' have negative recorded balances. Review their transactions.' : ' has a negative recorded balance. Review its transactions.')
      : accounts.some((account) => account.archived) ? 'Archived account balances still count toward Total Money.'
      : accounts.some((account) => !account.includedInAvailable && account.purpose !== 'savings') ? 'Some accounts are excluded from Available Money.'
      : savings !== 0 ? formatMoney(savings) + ' is recorded in your savings accounts.'
      : '';
  }
  catch (cause) { error = cause instanceof Error ? cause.message : 'Could not calculate balances.'; }
  return <FinanceScreen title="Accounts" scrollEnabled={!dragging} headerAccessory={<Pressable accessibilityRole="button" accessibilityLabel="Add account" disabled={busy} onPress={() => router.push('/account')} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.backgroundSelected, opacity: pressed || busy ? 0.5 : 1 })}>
        <Ionicons name="add" size={16} color={theme.accent} /><ThemedText type="smallBold" themeColor="accent">Add account</ThemedText>
      </Pressable>} floatingAction={<AddTransactionButton disabled={busy} />}>
    <LinearGradient colors={[theme.backgroundSelected, theme.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 12, borderRadius: 22, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={money?.hasNegativeAccount ? require('../../../../assets/images/mascot/concerned.png') : require('../../../../assets/images/mascot/friendly.png')} contentFit="contain" accessible={false} style={{ width: 80, height: 94 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Explain Total and Available Money" onPress={() => setDetailsOpen(true)} style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.backgroundElement, gap: 4, opacity: pressed ? 0.7 : 1 })}>
          <View style={{ position: 'absolute', left: -5, top: 24, width: 10, height: 10, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: theme.accent, backgroundColor: theme.backgroundElement, transform: [{ rotate: '45deg' }] }} />
          <ThemedText type="smallBold" themeColor="accent">Kuwenta</ThemedText>
          {money ? <>
            <ThemedText type="small">You have <ThemedText type="smallBold">{formatMoney(money.totalMoney)}</ThemedText> recorded in total.</ThemedText>
            <ThemedText type="small"><ThemedText type="smallBold">{formatMoney(money.availableMoney)}</ThemedText> is available for spending.</ThemedText>
          </> : <ThemedText type="small" accessibilityRole="alert" themeColor="error">{error}</ThemedText>}
        </Pressable>
      </View>

    </LinearGradient>
    {money && accountInsight ? <Pressable accessibilityRole="button" accessibilityLabel="Explain account balances" onPress={() => setDetailsOpen(true)} style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="bulb-outline" size={18} color={theme.accent} /><ThemedText type="smallBold">Account insight</ThemedText></View>
      <ThemedText type="small" themeColor="textSecondary">{accountInsight}</ThemedText>
    </Pressable> : null}
    <Modal visible={detailsOpen} transparent animationType="fade" onRequestClose={() => setDetailsOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close balance details" onPress={() => setDetailsOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: theme.backgroundElement }}>
          <View accessibilityViewIsModal style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><ThemedText type="smallBold" style={{ flex: 1 }}>Your recorded money</ThemedText><Pressable accessibilityRole="button" accessibilityLabel="Close balance details" onPress={() => setDetailsOpen(false)} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="close" size={20} color={theme.text} /></Pressable></View>
            <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
              <ThemedText type="small">Total Money includes every account balance, including savings and archived accounts.</ThemedText>
              <ThemedText type="small">Available Money includes accounts marked for spending availability, including archived accounts with that setting. It does not reserve money for budgets or upcoming bills.</ThemedText>
              <ThemedText type="small">These balances come from your starting money and recorded activity. Kuwenta does not check your bank or actual cash.</ThemedText>
              {accountInsight ? <ThemedText type="small">{accountInsight}</ThemedText> : null}
              {money ? accounts.filter((account) => account.archived || !account.includedInAvailable).map((account) => <ThemedText key={account.id} type="small">{account.name}: {formatMoney(calculateAccountSummary(account, transactions, '1900-01').balance)}{account.archived ? ' (archived)' : ''}{!account.includedInAvailable ? ' - excluded from Available Money' : ''}</ThemedText>) : null}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
    <AccountsOverview showAdd={false} onDraggingChange={setDragging} />
  </FinanceScreen>;
}
