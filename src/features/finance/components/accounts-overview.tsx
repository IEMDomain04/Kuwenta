import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { calculateAccountSummary } from '../calculations';
import { formatMoney } from '../money';
import { ActionButton } from './ui';

export function AccountsOverview({ compact = false, showAdd = true }: { compact?: boolean; showAdd?: boolean }) {
  const { accounts, transactions, busy } = useFinance();
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const [showArchived, setShowArchived] = useState(false);
  const [layout, setLayout] = useState<'cards' | 'list'>('cards');
  const cards = !compact && layout === 'cards';
  const active = accounts.filter((account) => !account.archived);
  const visible = compact ? active.slice(0, 3) : accounts.filter((account) => showArchived || !account.archived);
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <ThemedText type="smallBold" accessibilityRole="header">Your accounts</ThemedText>
      <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
        {compact ? <ActionButton compact label="View all" disabled={busy} onPress={() => router.navigate('/accounts')} /> : (['cards', 'list'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'cards' ? 'Account cards' : 'Account list'} accessibilityState={{ selected: layout === value }} onPress={() => setLayout(value)} style={{ minWidth: 44, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: layout === value ? theme.backgroundSelected : theme.backgroundElement }}><Ionicons name={value === 'cards' ? 'grid-outline' : 'list-outline'} size={18} color={theme.accent} /></Pressable>)}
        {showAdd ? <ActionButton compact label="Add account" disabled={busy} onPress={() => router.push('/account')} /> : null}
      </View>
    </View>
    {(['spending', 'savings'] as const).map((purpose) => {
      const rows = visible.filter((account) => account.purpose === purpose);
      if (!rows.length) return null;
      return <View key={purpose} style={{ gap: 8 }}>
        <ThemedText type="small" style={{ fontSize: 11, lineHeight: 16 }} themeColor="textSecondary" accessibilityRole="header">{purpose === 'spending' ? 'Spending' : 'Savings'}</ThemedText>
        <View style={{ flexDirection: cards ? 'row' : 'column', flexWrap: 'wrap', gap: 10 }}>{rows.map((account) => {
          const balance = calculateAccountSummary(account, transactions, '1900-01').balance;
          const color = purpose === 'savings' ? theme.income : theme.secondary;
          return <Pressable key={account.id} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} accessibilityLabel={account.name + ', ' + formatMoney(balance) + (account.archived ? ', archived' : '')}
            onPress={() => router.push({ pathname: '/account', params: { id: account.id } })}
            style={({ pressed }) => ({ ...(cards ? { flexBasis: fontScale > 1.3 ? '100%' : '47%', flexGrow: 0, minWidth: 135, minHeight: 154 } : { width: '100%' }), padding: 14, borderRadius: cards ? 20 : 16, borderWidth: 1, borderColor: account.archived || !cards ? theme.border : color, boxShadow: cards ? '0 3px 8px rgba(20, 36, 67, 0.08)' : undefined, flexDirection: cards ? 'column' : 'row', alignItems: cards ? 'stretch' : 'center', gap: 10, backgroundColor: cards && !account.archived ? color : theme.backgroundElement, opacity: pressed || busy ? 0.5 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: cards ? undefined : 1 }}>
              <Ionicons name={purpose === 'savings' ? 'shield-checkmark-outline' : 'wallet-outline'} size={20} color={cards && !account.archived ? theme.onAccent : color} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 12, lineHeight: 17, color: cards && !account.archived ? theme.onAccent : theme.text }}>{account.name}</ThemedText>
                <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: cards && !account.archived ? theme.onAccent : theme.textSecondary }}>{account.archived ? 'Archived / PHP' : purpose === 'savings' ? 'Savings / PHP' : 'Spending / PHP'}</ThemedText>
              </View>
            </View>
            <View style={{ gap: 3, marginTop: cards ? 'auto' : 0 }}>
              <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: cards && !account.archived ? theme.onAccent : theme.textSecondary }}>CURRENT BALANCE</ThemedText>
              <ThemedText style={{ fontSize: cards ? 18 : 16, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'], color: cards && !account.archived ? theme.onAccent : theme.text }}>{formatMoney(balance)}</ThemedText>
              {balance < 0 ? <ThemedText type="small" accessibilityRole="alert" style={{ color: cards && !account.archived ? theme.onAccent : theme.text }}>Negative balance</ThemedText> : null}
            </View>
            {cards ? <ThemedText type="small" style={{ fontSize: 10, lineHeight: 14, color: account.archived ? theme.textSecondary : theme.onAccent }}>{account.includedInAvailable ? 'Included in Available Money' : 'Excluded from Available Money'}</ThemedText> : <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
          </Pressable>;
        })}</View>
      </View>;
    })}
    {visible.length === 0 ? <ThemedText type="small">No active accounts. Add one or show archived accounts.</ThemedText> : null}
    {!compact && accounts.some((account) => account.archived) ? <ActionButton compact label={showArchived ? 'Hide archived accounts' : 'Show archived accounts'} selected={showArchived} onPress={() => setShowArchived(!showArchived)} /> : null}
  </View>;
}
