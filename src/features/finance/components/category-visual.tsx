import { ThemedText } from '@/components/themed-text';
import { formatMoney } from '../money';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { PieChart } from 'react-native-gifted-charts';
import { View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

const visuals: Record<string, { color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  Food: { color: '#ED8B35', icon: 'restaurant' },
  Transportation: { color: '#3196D5', icon: 'bus' },
  Shopping: { color: '#8964CF', icon: 'bag-handle' },
  Bills: { color: '#3196D5', icon: 'document-text' },
  Entertainment: { color: '#8571C6', icon: 'game-controller' },
  Health: { color: '#D66A82', icon: 'heart' },
  Education: { color: '#558BB3', icon: 'book' },
  Family: { color: '#CC8154', icon: 'home' },
  Subscriptions: { color: '#5C8B9A', icon: 'phone-portrait' },
  Other: { color: '#7D929D', icon: 'ellipsis-horizontal' },
};
const incomeVisual = { color: '#078548', icon: 'cash' as const };
export function categoryVisual(category: string, income = false) {
  return income ? incomeVisual : visuals[category] ?? visuals.Other;
}
export function svgSource(body: string, viewBox = '0 0 24 24') {
  return { uri: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '">' + body + '</svg>') };
}
export function CategoryIcon({ category, income = false, compact = false }: { category: string; income?: boolean; compact?: boolean }) {
  const { color, icon } = categoryVisual(category, income);
  return <View accessible={false} style={{ width: compact ? 26 : 36, height: compact ? 26 : 36, borderRadius: compact ? 9 : 12, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '20' }}>
    <Ionicons name={icon} size={compact ? 16 : 22} color={color} />
  </View>;
}
export function SpendingDonut({ categories, total }: { categories: { category: string; amount: number }[]; total: number }) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const formatted = formatMoney(total);
  const centerFits = formatted.length <= 9 && fontScale <= 1.2;
  if (total <= 0 || categories.length === 0) return <ThemedText themeColor="textSecondary">No expenses this month.</ThemedText>;
  return <View style={{ alignItems: 'center', gap: 8 }}>
    <View accessible={false}>
      <PieChart donut radius={56} innerRadius={40} innerCircleColor={theme.backgroundElement}
        data={categories.map(({ category, amount }) => ({ value: amount, color: categoryVisual(category).color }))}
        centerLabelComponent={() => centerFits
          ? <View style={{ alignItems: 'center', gap: 2 }}><ThemedText type="smallBold" style={{ fontSize: 15, lineHeight: 19, fontVariant: ['tabular-nums'] }}>{formatted}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 9, lineHeight: 12 }}>Total spent</ThemedText></View>
          : null} />
    </View>
    {!centerFits && <View style={{ maxWidth: 200, gap: 4 }}><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 9, lineHeight: 12 }}>Total spent</ThemedText><ThemedText type="smallBold" style={{ fontSize: 15, lineHeight: 19, fontVariant: ['tabular-nums'] }}>{formatted}</ThemedText></View>}
  </View>;
}