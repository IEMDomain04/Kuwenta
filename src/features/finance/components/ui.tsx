import { Ionicons } from '@react-native-vector-icons/ionicons';
import { CategoryIcon } from './category-visual';
import { formatTransactionDateTime } from '../dates';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '../money';
import type { Transaction } from '../types';

export function FinanceScreen({ title, children, scroll = true, tabScreen = true, headerAccessory, headerLeading, floatingAction, centeredTitle = false }: { title: string; children: ReactNode; scroll?: boolean; tabScreen?: boolean; headerAccessory?: ReactNode; headerLeading?: ReactNode; floatingAction?: ReactNode; centeredTitle?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const content = <><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, ...(centeredTitle ? { justifyContent: 'center' } : {}) }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>{headerLeading}<ThemedText type="subtitle" style={!tabScreen || centeredTitle ? { fontSize: 22, lineHeight: 30, flexShrink: 1 } : undefined} accessibilityRole="header">{title}</ThemedText></View>{headerAccessory}</View>{children}</>;
  return <SafeAreaView edges={tabScreen ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.background }]}>
    {scroll ? <ScrollView style={{ flex: 1 }} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, !!floatingAction && { paddingBottom: 90 }, !tabScreen && { paddingBottom: 16 }]}>{content}</ScrollView>
      : <ThemedView style={[styles.content, styles.fill, !tabScreen && { paddingBottom: 16 }]}>{content}</ThemedView>}
    {floatingAction && <View style={{ position: 'absolute', right: Math.max(insets.right, 16), bottom: 16 }}>{floatingAction}</View>}
  </SafeAreaView>;
}
export function ActionButton({ label, onPress, disabled = false, selected, primary = false, compact = false, soft = false }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean; primary?: boolean; compact?: boolean; soft?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: primary ? theme.accent : selected ? theme.backgroundSelected : soft ? theme.incomeSurface : theme.backgroundElement, borderWidth: 2, borderColor: selected ? theme.accent : theme.border }, compact && { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12 }, (pressed || disabled) && { opacity: 0.5 }]}>
    <ThemedText type="smallBold" style={primary ? { color: theme.onAccent } : undefined}>{selected ? '✓ ' : ''}{label}</ThemedText>
  </Pressable>;
}
export function TransactionRow({ transaction, accountName, destinationName, disabled, onEdit, onDelete }: { transaction: Transaction; accountName: string; destinationName?: string; disabled: boolean; onEdit: () => void; onDelete: () => void }) {
  const theme = useTheme();
  const income = transaction.type === 'INCOME';
  return <ThemedView type="backgroundElement" style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 4 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={(transaction.type === 'ADJUSTMENT' ? 'View account for ' : 'Edit ') + transaction.category + ', ' + formatMoney(transaction.amount) + ', ' + formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime)}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onEdit}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10, opacity: pressed || disabled ? 0.5 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <CategoryIcon category={transaction.category} income={income} />
        <View style={{ flex: 1, minWidth: 90, gap: 1 }}>
          <ThemedText type="smallBold" numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>{transaction.notes || transaction.category}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 16 }}>{transaction.type === "TRANSFER" ? accountName + " to " + destinationName : transaction.category + " · " + accountName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 16 }}>{formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime).split(' · ')[1]}</ThemedText>
        </View>
        <ThemedText type="smallBold" style={{ color: income ? theme.income : theme.text, fontVariant: ['tabular-nums'], flexShrink: 1, fontSize: 14, lineHeight: 20 }}>
          {transaction.type === 'TRANSFER' ? '' : (income || transaction.type === 'ADJUSTMENT' && transaction.adjustmentDirection === 'increase') ? '+' : '−'}{formatMoney(transaction.amount)}
        </ThemedText>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={'Delete ' + transaction.category + ', ' + formatMoney(transaction.amount)}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onDelete}
      style={({ pressed }) => ({ width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed || disabled ? 0.5 : 1 })}>
      <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
    </Pressable>
  </ThemedView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 16, gap: 12, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  fill: { flex: 1 },
  button: { padding: 16, minHeight: 48, borderRadius: 12, alignItems: 'center' },
  card: { padding: 16, borderRadius: 12, gap: 6 },
});
