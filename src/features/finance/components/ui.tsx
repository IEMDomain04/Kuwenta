import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { CategoryIcon } from './category-visual';
import { formatTransactionDateTime } from '../dates';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  const content = <><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, ...(centeredTitle ? { justifyContent: 'center' } : {}) }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>{headerLeading ?? (!tabScreen ? <BackButton /> : null)}<ThemedText type="subtitle" style={!tabScreen || centeredTitle ? { fontSize: 20, lineHeight: 28, flexShrink: 1 } : undefined} accessibilityRole="header">{title}</ThemedText></View>{headerAccessory}</View>{children}</>;
  return <SafeAreaView edges={tabScreen ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.background }]}>
    {scroll ? <ScrollView style={{ flex: 1 }} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, !!floatingAction && { paddingBottom: 90 }, !tabScreen && { paddingBottom: 16 }]}>{content}</ScrollView>
      : <ThemedView style={[styles.content, styles.fill, !tabScreen && { paddingBottom: 16 }]}>{content}</ThemedView>}
    {floatingAction && <View style={{ position: 'absolute', right: Math.max(insets.right, 16), bottom: tabScreen ? 16 : Math.max(insets.bottom, 16) }}>{floatingAction}</View>}
  </SafeAreaView>;
}
export function ActionButton({ label, onPress, disabled = false, selected, primary = false, compact = false, soft = false }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean; primary?: boolean; compact?: boolean; soft?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: disabled ? theme.disabledBackground : primary ? pressed ? theme.secondary : theme.accentPressed : selected ? theme.backgroundSelected : soft ? theme.incomeSurface : theme.backgroundElement, borderWidth: 2, borderColor: selected ? theme.accent : theme.border }, compact && { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12 }, pressed && !primary && { opacity: 0.7 }]}>
    <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail" style={{ maxWidth: '100%', textAlign: 'center', color: disabled ? theme.disabledText : primary ? theme.onAccent : theme.text }}>{selected ? '✓ ' : ''}{label}</ThemedText>
  </Pressable>;
}
export function IconButton({ icon, label, onPress, disabled = false, destructive = false }: { icon: 'pencil-outline' | 'trash-outline'; label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: 44, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: destructive ? theme.errorSurface : theme.infoSurface, opacity: disabled || pressed ? 0.5 : 1 })}>
    <Ionicons name={icon} size={19} color={destructive ? theme.error : theme.secondary} />
  </Pressable>;
}
export function TransactionRow({ transaction, accountName, destinationName, disabled, onEdit, onDelete, showDate = false }: { transaction: Transaction; accountName: string; destinationName?: string; disabled: boolean; onEdit: () => void; onDelete?: () => void; showDate?: boolean }) {
  const theme = useTheme();
  const income = transaction.type === 'INCOME';
  return <ThemedView type="backgroundElement" style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 4 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={(transaction.type === 'ADJUSTMENT' ? 'View account for ' : 'Edit ') + transaction.category + ', ' + formatMoney(transaction.amount) + ', ' + formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime)}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onEdit}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10, opacity: pressed || disabled ? 0.5 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <CategoryIcon category={transaction.category} income={income} compact />
        <View style={{ flex: 1, minWidth: 90, gap: 1 }}>
          <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 12, lineHeight: 18 }}>{transaction.notes || transaction.category}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 16 }}>{transaction.type === "TRANSFER" ? accountName + ' → ' + destinationName : transaction.category + " · " + accountName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, lineHeight: 16 }}>{showDate ? formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime) : formatTransactionDateTime(transaction.transactionDate, transaction.transactionTime).split(' · ')[1]}</ThemedText>
        </View>
        <ThemedText type="smallBold" style={{ color: income ? theme.income : theme.text, fontVariant: ['tabular-nums'], flexShrink: 1, fontSize: 14, lineHeight: 20 }}>
          {transaction.type === 'TRANSFER' ? '' : (income || transaction.type === 'ADJUSTMENT' && transaction.adjustmentDirection === 'increase') ? '+' : '−'}{formatMoney(transaction.amount)}
        </ThemedText>
      </View>
    </Pressable>
    {onDelete ? <Pressable accessibilityRole="button" accessibilityLabel={'Delete ' + transaction.category + ', ' + formatMoney(transaction.amount)}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onDelete}
      style={({ pressed }) => ({ width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed || disabled ? 0.5 : 1 })}>
      <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
    </Pressable> : null}
  </ThemedView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 16, gap: 12, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  fill: { flex: 1 },
  button: { padding: 16, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderRadius: 12, gap: 6 },
});

export function BackButton({ onPress, disabled = false }: { onPress?: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={disabled} accessibilityState={{ disabled }}
    onPress={onPress ?? (() => { if (router.canGoBack()) router.back(); else router.replace('/'); })}
    style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name="arrow-back" size={24} color={theme.text} />
  </Pressable>;
}
export function AddTransactionButton({ disabled }: { disabled: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const items = [
    { label: 'Income', description: 'Record money received', icon: 'arrow-down-outline', type: 'INCOME' },
    { label: 'Expense', description: 'Record spending', icon: 'arrow-up-outline', type: 'EXPENSE' },
    { label: 'Transfer', description: 'Move money between accounts', icon: 'swap-horizontal', type: 'TRANSFER' },
    { label: 'Money Check', description: 'Preview spending and review your money', icon: 'chatbubble-outline', type: 'CHAT' },
  ] as const;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Add money activity" disabled={disabled} accessibilityState={{ disabled, expanded: open }} onPress={() => setOpen(true)} style={({ pressed }) => ({ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, elevation: 4, opacity: disabled || pressed ? 0.5 : 1 })}><Ionicons name="add" size={30} color={theme.onAccent} /></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end', padding: 16, paddingBottom: insets.bottom + 80, backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close actions" onPress={() => setOpen(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 300, padding: 10, borderRadius: 20, backgroundColor: theme.backgroundElement }}>
          {items.map((item) => <Pressable key={item.type} accessibilityRole="button" disabled={disabled} onPress={() => {
            setOpen(false);
            if (item.type === 'CHAT') router.push('/chat');
            else if (item.type === 'TRANSFER') router.push('/transfer');
            else router.push({ pathname: '/transaction', params: { type: item.type } });
          }} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 }}>
            <Ionicons name={item.icon} size={20} color={item.type === 'INCOME' ? theme.income : theme.accentPressed} />
            <View style={{ flex: 1 }}><ThemedText type="smallBold">{item.label}</ThemedText><ThemedText type="small" themeColor="textSecondary">{item.description}</ThemedText></View>
          </Pressable>)}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close actions" onPress={() => setOpen(false)} style={{ marginTop: 10, width: 58, height: 58, borderRadius: 29, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={28} color={theme.onAccent} /></Pressable>
      </View>
    </Modal>
  </>;
}
