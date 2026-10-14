import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { formatMoney } from '../money';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { PieChart } from 'react-native-gifted-charts';
import { View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

const visuals: Record<string, { color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  'Balance adjustment': { color: Colors.light.accent, icon: 'options-outline' },
  Transfer: { color: Colors.light.accent, icon: 'swap-horizontal' },
  Groceries: { color: '#527326', icon: 'cart' },
  'Personal Care': { color: '#0B6575', icon: 'body' },
  'Cleaning Supplies': { color: '#17658F', icon: 'sparkles' },
  Snacks: { color: '#94620B', icon: 'fast-food' },
  Drinks: { color: '#0B6575', icon: 'water' },
  'Mobile Load': { color: '#0B6575', icon: 'phone-portrait' },
  'Mobile Data': { color: '#17658F', icon: 'cellular' },
  Games: { color: '#6543A0', icon: 'game-controller' },
  Tech: { color: '#033F77', icon: 'desktop' },
  Accessories: { color: '#805436', icon: 'headset' },
  'School Supplies': { color: '#6651A0', icon: 'pencil' },
  'Personal Items': { color: '#855006', icon: 'bag-handle' },
  Meals: { color: '#A65313', icon: 'restaurant' },
  'Snacks & Drinks': { color: '#94620B', icon: 'fast-food' },
  Transport: { color: '#17658F', icon: 'bus' },
  'Café': { color: '#805436', icon: 'cafe' },
  'Mobile Load & Data': { color: '#0B6575', icon: 'phone-portrait' },
  'Games & Entertainment': { color: '#6543A0', icon: 'game-controller' },
  'Tech & Accessories': { color: '#033F77', icon: 'desktop' },
  'School & Personal Items': { color: '#6651A0', icon: 'bag-handle' },
  Fees: { color: '#855006', icon: 'receipt' },
  Food: { color: '#ED8B35', icon: 'restaurant' },
  Transportation: { color: '#3196D5', icon: 'bus' },
  Shopping: { color: '#8964CF', icon: 'bag-handle' },
  Bills: { color: '#3196D5', icon: 'document-text' },
  Entertainment: { color: '#8571C6', icon: 'film' },
  Health: { color: '#D66A82', icon: 'heart' },
  Education: { color: '#558BB3', icon: 'book' },
  Family: { color: '#CC8154', icon: 'home' },
  Subscriptions: { color: '#5C8B9A', icon: 'phone-portrait' },
  Other: { color: '#7D929D', icon: 'ellipsis-horizontal' },
};
visuals['E-bank Cash-in'] = { color: '#0B6575', icon: 'arrow-down-circle' };
visuals['E-bank Cash-out'] = { color: '#0B6575', icon: 'arrow-up-circle' };
visuals['Service sale'] = { color: '#087443', icon: 'storefront' };
visuals['Cash-in (E-bank)'] = visuals['E-bank Cash-in'];
visuals['Cash-out (E-bank)'] = visuals['E-bank Cash-out'];
const incomeVisual = { color: Colors.light.income, icon: 'cash' as const };
export function categoryVisual(category: string, income = false, dark = false) {
  if (category === 'Service exchange') category = 'Service sale';
  const visual = income ? incomeVisual : visuals[category] ?? visuals.Other;
  if (!dark) return visual;
  // Lift category colors against dark surfaces without changing their hue family.
  const color = '#' + visual.color.slice(1).match(/../g)!.map((channel) =>
    Math.round(parseInt(channel, 16) * 0.5 + 255 * 0.5).toString(16).padStart(2, '0')).join('');
  return { ...visual, color };
}
export function svgSource(body: string, viewBox = '0 0 24 24') {
  return { uri: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '">' + body + '</svg>') };
}
export function CategoryIcon({ category, income = false, compact = false }: { category: string; income?: boolean; compact?: boolean }) {
  const dark = useColorScheme() === 'dark';
  const { color, icon } = categoryVisual(category, income, dark);
  return <View accessible={false} style={{ width: compact ? 26 : 36, height: compact ? 26 : 36, borderRadius: compact ? 9 : 12, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '20' }}>
    <Ionicons name={icon} size={compact ? 16 : 22} color={color} />
  </View>;
}
export function SpendingDonut({ categories, total }: { categories: { category: string; amount: number }[]; total: number }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const { fontScale } = useWindowDimensions();
  const formatted = formatMoney(total);
  const centerFits = formatted.length <= 9 && fontScale <= 1.2;
  if (total <= 0 || categories.length === 0) return <ThemedText themeColor="textSecondary">No expenses this month.</ThemedText>;
  return <View style={{ alignItems: 'center', gap: 8 }}>
    <View accessible={false}>
      <PieChart donut radius={56} innerRadius={40} innerCircleColor={theme.backgroundElement}
        data={categories.map(({ category, amount }) => ({ value: amount, color: categoryVisual(category, false, dark).color }))}
        centerLabelComponent={() => centerFits
          ? <View style={{ alignItems: 'center', gap: 2 }}><ThemedText type="smallBold" style={{ fontSize: 15, lineHeight: 19, fontVariant: ['tabular-nums'] }}>{formatted}</ThemedText><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 9, lineHeight: 12 }}>Total spent</ThemedText></View>
          : null} />
    </View>
    {!centerFits && <View style={{ maxWidth: 200, gap: 4 }}><ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 9, lineHeight: 12 }}>Total spent</ThemedText><ThemedText type="smallBold" style={{ fontSize: 15, lineHeight: 19, fontVariant: ['tabular-nums'] }}>{formatted}</ThemedText></View>}
  </View>;
}