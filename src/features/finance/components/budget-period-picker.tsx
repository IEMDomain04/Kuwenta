import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { budgetPeriodKey, budgetPeriodLabel, type BudgetPeriod } from '../budget-periods';
import { SelectionSheet } from './selection-sheet';
export function BudgetPeriodPicker({ period, date, disabled, onPeriodChange, showDate = true, allowAll = false }: { period: BudgetPeriod | 'all'; date: string; disabled: boolean; onPeriodChange: (period: BudgetPeriod | 'all') => void; showDate?: boolean; allowAll?: boolean }) {
  const theme = useTheme(); const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Budget period" accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => setOpen(true)} style={{ minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.backgroundElement, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} />
      <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{period === 'all' ? 'All budgets' : period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'}</ThemedText><Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
    </Pressable>
    {showDate && period !== 'all' ? <ThemedText type="small" themeColor="textSecondary">{budgetPeriodLabel(budgetPeriodKey(period, date))}</ThemedText> : null}
    <SelectionSheet visible={open} title="Budget period" selected={period} disabled={disabled} options={[...(allowAll ? [{ value: 'all', label: 'All budgets' }] : []), { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly (Monday - Sunday)' }, { value: 'monthly', label: 'Monthly' }]} onClose={() => setOpen(false)} onSelect={value => onPeriodChange(value as BudgetPeriod | 'all')} />
  </View>;
}
