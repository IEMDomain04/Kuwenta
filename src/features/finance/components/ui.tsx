import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '../money';
import type { Transaction } from '../types';

export function FinanceScreen({ title, children, scroll = true, tabScreen = true }: { title: string; children: ReactNode; scroll?: boolean; tabScreen?: boolean }) {
  const theme = useTheme();
  const content = <><ThemedText type="subtitle" accessibilityRole="header">{title}</ThemedText>{children}</>;
  return <SafeAreaView edges={tabScreen ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.background }]}>
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, !tabScreen && { paddingBottom: 16 }]}>{content}</ScrollView>
      : <ThemedView style={[styles.content, styles.fill, !tabScreen && { paddingBottom: 16 }]}>{content}</ThemedView>}
  </SafeAreaView>;
}
export function ActionButton({ label, onPress, disabled = false, selected, primary = false, compact = false }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean; primary?: boolean; compact?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: primary ? theme.text : selected ? theme.backgroundSelected : theme.backgroundElement, borderWidth: 2, borderColor: selected ? theme.text : 'transparent' }, compact && { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12 }, (pressed || disabled) && { opacity: 0.5 }]}>
    <ThemedText type="smallBold" style={primary ? { color: theme.background } : undefined}>{selected ? '✓ ' : ''}{label}</ThemedText>
  </Pressable>;
}
export function TransactionRow({ transaction }: { transaction: Transaction }) {
  return <ThemedView type="backgroundElement" style={styles.card}>
    <ThemedText style={{ fontSize: 22, lineHeight: 30, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{transaction.type === 'INCOME' ? '+' : '−'}{formatMoney(transaction.amount)}</ThemedText>
    <ThemedText type="smallBold">{transaction.category} · {transaction.type === 'INCOME' ? 'Income' : 'Expense'}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">{transaction.transactionDate} · {transaction.transactionTime} PH</ThemedText>
    {transaction.notes ? <ThemedText type="small">{transaction.notes}</ThemedText> : null}
  </ThemedView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 24, paddingBottom: BottomTabInset + 24, gap: 16, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  fill: { flex: 1 },
  button: { padding: 16, minHeight: 48, borderRadius: 12, alignItems: 'center' },
  card: { padding: 16, borderRadius: 12, gap: 6 },
});
