import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { calculateAccountSummary } from '../calculations';
import { formatMoney } from '../money';
import { ActionButton } from './ui';

export function AccountsOverview({ compact = false }: { compact?: boolean }) {
  const { accounts, transactions, busy } = useFinance();
  const theme = useTheme();
  const [showArchived, setShowArchived] = useState(false);
  const active = accounts.filter((account) => !account.archived);
  const visible = compact ? active.slice(0, 3) : accounts.filter((account) => showArchived || !account.archived);
  return <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 12 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <ThemedText type="smallBold" accessibilityRole="header">Accounts</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {compact && <ActionButton compact label="View all" disabled={busy} onPress={() => router.navigate('/accounts')} />}
        <ActionButton compact label="Add account" disabled={busy} onPress={() => router.push('/account')} />
      </View>
    </View>
    {(['spending', 'savings'] as const).map((purpose) => {
      const rows = visible.filter((account) => account.purpose === purpose);
      if (!rows.length) return null;
      return <View key={purpose} style={{ gap: 8 }}>
        <ThemedText type="small" themeColor="textSecondary" accessibilityRole="header">{purpose === 'spending' ? 'Spending' : 'Savings'}</ThemedText>
        {rows.map((account) => {
          const balance = calculateAccountSummary(account, transactions, '1900-01').balance;
          return <Pressable key={account.id} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} accessibilityLabel={account.name + ', ' + formatMoney(balance) + (account.archived ? ', archived' : '')}
            onPress={() => router.push({ pathname: '/account', params: { id: account.id } })}
            style={({ pressed }) => ({ minHeight: 58, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: theme.border, opacity: pressed || busy ? 0.5 : 1 })}>
            <Ionicons name={purpose === 'savings' ? 'shield-checkmark-outline' : 'wallet-outline'} size={24} color={theme.accent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail">{account.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{account.archived ? 'Archived' : account.includedInAvailable ? 'Available spending money' : 'Excluded from Available Money'}</ThemedText>
            </View>
            <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
              <ThemedText type="smallBold" style={{ fontVariant: ['tabular-nums'], flexShrink: 1 }}>{formatMoney(balance)}</ThemedText>
              {balance < 0 && <ThemedText type="small" accessibilityRole="alert">Negative balance</ThemedText>}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>;
        })}
      </View>;
    })}
    {visible.length === 0 && <ThemedText type="small">No active accounts. Add one or show archived accounts.</ThemedText>}
    {!compact && accounts.some((account) => account.archived) && <ActionButton label={showArchived ? 'Hide archived accounts' : 'Show archived accounts'} selected={showArchived} onPress={() => setShowArchived(!showArchived)} />}
    {compact && accounts.length > visible.length && <ThemedText type="small" themeColor="textSecondary">{accounts.length - visible.length} more accounts in View all.</ThemedText>}
  </View>;
}
