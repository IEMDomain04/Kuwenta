import { useMemo } from 'react';
import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { accountCardColor } from '../account-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { calculateAccountSummary, calculateCurrentMoney } from '../calculations';
import { formatMoney } from '../money';
import { useFinance } from '../provider';
import { AccountIcon } from './account-icon';

export function AccountBalances() {
  const { accounts, transactions } = useFinance();
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const { rows, totals, maximum } = useMemo(() => {
    const totals = calculateCurrentMoney(accounts, transactions);
    const rows = accounts.map(account => ({ account, balance: calculateAccountSummary(account, transactions, '1900-01').balance }));
    return { rows, totals, maximum: Math.max(1, ...rows.map(row => Math.abs(row.balance))) };
  }, [accounts, transactions]);
  return <View style={{ padding: 14, borderRadius: 20, backgroundColor: theme.backgroundElement, gap: 12 }}>
    <ThemedText type="smallBold" accessibilityRole="header">Where your money is</ThemedText>
    <View style={{ gap: 4 }}>
      <ThemedText type="smallBold">Total money: {formatMoney(totals.totalMoney, true)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Available for spending: {formatMoney(totals.availableMoney, true)}</ThemedText>
    </View>
    {rows.map(({ account, balance }) => {
      const color = accountCardColor(account, dark);
      return <View key={account.id} style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AccountIcon account={account} size={20} color={color} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText type="smallBold" numberOfLines={1}>{account.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10, lineHeight: 14 }}>{account.purpose === 'savings' ? 'Savings' : 'Spending'}{account.includedInAvailable ? '' : ' | Not in available money'}{account.archived ? ' | Archived' : ''}</ThemedText>
          </View>
          <ThemedText type="smallBold" style={{ color: balance < 0 ? theme.expense : color, fontVariant: ['tabular-nums'], flexShrink: 1 }}>{formatMoney(balance, true)}</ThemedText>
        </View>
        <View accessible accessibilityLabel={account.name + ', balance ' + formatMoney(balance)} style={{ height: 10, borderRadius: 5, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: color, width: `${Math.abs(balance) / maximum * 100}%` }} />
        </View>
      </View>;
    })}

  </View>;
}
