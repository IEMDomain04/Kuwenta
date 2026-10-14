import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { accountInsights } from '../insights';
import { philippineDateTime } from '../dates';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import { AccountsOverview } from '../components/accounts-overview';
import { FinanceScreen, AddTransactionButton } from '../components/ui';

export default function AccountsScreen() {
  const { accounts, transactions, budgets, busy } = useFinance();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [dragging, setDragging] = useState(false);
  const [details, setDetails] = useState<'money' | 'insights' | null>(null);
  const date = philippineDateTime(new Date()).transactionDate;
  const result = useMemo(() => {
    try { return { money: accountInsights(accounts, transactions, budgets, new Date(date + 'T00:00:00+08:00')), error: '' }; }
    catch (cause) { return { money: undefined, error: cause instanceof Error ? cause.message : 'Could not calculate balances.' }; }
  }, [accounts, transactions, budgets, date]);
  const { money, error } = result;
  return <FinanceScreen title="Accounts" scrollEnabled={!dragging} headerAccessory={<Pressable accessibilityRole="button" accessibilityLabel="Add account" disabled={busy} onPress={() => router.push('/account')} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: theme.backgroundSelected, opacity: pressed || busy ? 0.5 : 1 })}>
        <Ionicons name="add" size={16} color={theme.accent} /><ThemedText type="smallBold" themeColor="accent">Add account</ThemedText>
      </Pressable>} floatingAction={<AddTransactionButton disabled={busy} />}>
    <LinearGradient colors={[theme.backgroundSelected, theme.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 12, borderRadius: 22, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 80, alignSelf: 'stretch', justifyContent: 'center', paddingTop: 28 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Explain Total and Available Money" onPress={() => setDetails('money')} style={({ pressed }) => ({ position: 'absolute', top: -8, left: -8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="help-circle-outline" size={16} color={theme.accent} />
          </Pressable>
          <Image source={money?.hasNegativeAccount ? require('../../../../assets/images/mascot/concerned.png') : require('../../../../assets/images/mascot/friendly.png')} contentFit="contain" accessible={false} style={{ width: 80, height: 94 }} />
        </View>
        <View style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.backgroundElement, gap: 4 }}>
          <View style={{ position: 'absolute', left: -5, top: '50%', marginTop: 9, width: 10, height: 10, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: theme.accent, backgroundColor: theme.backgroundElement, transform: [{ rotate: '45deg' }] }} />
          <ThemedText type="smallBold" themeColor="accent">Kuwenta</ThemedText>
          {money ? <>
            <ThemedText type="small">You have <ThemedText type="smallBold">{formatMoney(money.totalMoney)}</ThemedText> recorded in total.</ThemedText>
            <ThemedText type="small"><ThemedText type="smallBold">{formatMoney(money.availableMoney)}</ThemedText> is available for spending.</ThemedText>
          </> : <ThemedText type="small" accessibilityRole="alert" themeColor="error">{error}</ThemedText>}
        </View>
      </View>
    </LinearGradient>
    {money && money.insights.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="View account insights" accessibilityHint="Opens relevant account feedback" onPress={() => setDetails('insights')} style={({ pressed }) => ({ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 6, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="bulb-outline" size={18} color={theme.accent} /><ThemedText type="smallBold" style={{ flex: 1 }}>Account insight</ThemedText>
        <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
      </View>
      <ThemedText type="small">{money.insights[0]}</ThemedText>
    </Pressable> : null}
    <Modal visible={details !== null} transparent animationType="fade" onRequestClose={() => setDetails(null)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={() => setDetails(null)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: theme.backgroundElement }}>
          <View accessibilityViewIsModal style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ThemedText type="smallBold" accessibilityRole="header" style={{ flex: 1 }}>{details === 'money' ? 'Your recorded money' : 'Account insights'}</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={() => setDetails(null)} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="close" size={20} color={theme.text} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
              {details === 'money' ? <>
                <ThemedText type="small">Total Money adds every account balance, including savings and archived accounts.</ThemedText>
                <ThemedText type="small">Available Money adds the accounts marked below as included. Budgets and upcoming bills do not automatically reserve this money.</ThemedText>
                {money?.balances.map(({ account, balance }) => <View key={account.id} style={{ gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ThemedText type="smallBold" style={{ flex: 1 }}>{account.name}</ThemedText>
                    <ThemedText type="small" style={{ flexShrink: 1 }}>{formatMoney(balance, true)}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">{account.includedInAvailable ? 'Included in Available Money' : 'Excluded from Available Money'}{account.purpose === 'savings' ? ' / Savings' : ''}{account.archived ? ' / Archived' : ''}</ThemedText>
                </View>)}
                {money ? <>
                  <ThemedText type="smallBold">Total Money: {formatMoney(money.totalMoney, true)}</ThemedText>
                  <ThemedText type="smallBold">Available Money: {formatMoney(money.availableMoney, true)}</ThemedText>
                </> : null}
                <ThemedText type="small" themeColor="textSecondary">Balances come from starting money and recorded activity. Kuwenta does not check your bank or actual cash.</ThemedText>
              </> : money?.insights.map(insight => <ThemedText key={insight} type="small">{insight}</ThemedText>)}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
    <AccountsOverview showAdd={false} onDraggingChange={setDragging} />
  </FinanceScreen>;
}
