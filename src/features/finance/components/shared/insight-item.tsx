import { View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import { insightPresentation } from '../../reporting/insight-presentation';

export function InsightItem({ message }: { message: string }) {
  const theme = useTheme();
  const { conceal } = useAmountVisibility();
  const { title, icon } = insightPresentation(message);
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
    <Ionicons accessible={false} name={icon} size={18} color={theme.accent} style={{ marginTop: 2 }} />
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{conceal(message)}</ThemedText>
    </View>
  </View>;
}
