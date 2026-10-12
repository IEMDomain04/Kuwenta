import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { budgetFeedback, type budgetReport } from '../budgets';
import { formatMoney } from '../money';
import { CategoryIcon } from './category-visual';

export function BudgetUsage({ row, available, totalRemaining, currentMonth, actions }: {
  row: ReturnType<typeof budgetReport>['rows'][number]; available: number; totalRemaining: number; currentMonth: boolean; actions?: ReactNode;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const feedback = budgetFeedback(row, available, totalRemaining, currentMonth);
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <CategoryIcon category={row.category} compact />
      <ThemedText type="smallBold" numberOfLines={2} style={{ flex: 1 }}>{row.category}</ThemedText>
      <ThemedText type="small" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} accessibilityLabel={`${formatMoney(row.spent, true)} spent of ${formatMoney(row.limitAmount, true)} limit`} style={{ maxWidth: '50%', fontSize: 11, lineHeight: 16, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatMoney(row.spent, true)} / {formatMoney(row.limitAmount, true)}</ThemedText>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={row.category + ' budget usage'} accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(row.progress * 100)), text: Math.round(row.progress * 100) + '% used' }} style={{ height: 6, borderRadius: 3, backgroundColor: theme.infoSurface, overflow: 'hidden' }}>
      <View style={{ height: 6, width: `${Math.min(1, row.progress) * 100}%`, backgroundColor: row.remaining < 0 ? theme.expense : theme.budget }} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={row.category + ' budget feedback'} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name="bulb-outline" size={16} color={theme.budget} />
      <ThemedText type="small" style={{ flex: 1, color: row.remaining < 0 ? theme.expense : theme.textSecondary }}>{feedback.message}</ThemedText>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textSecondary} />
    </Pressable>
    {actions}
    </View>
    {expanded ? <View style={{ gap: 6 }}>{feedback.details.map(detail => <ThemedText key={detail} type="small" themeColor="textSecondary">{detail}</ThemedText>)}</View> : null}
  </View>;
}
