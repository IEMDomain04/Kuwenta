import { Pressable } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useAmountVisibility } from '@/hooks/amount-visibility';
import { useTheme } from '@/hooks/use-theme';

export function AmountVisibilityButton() {
  const { hidden, toggle } = useAmountVisibility();
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'} onPress={toggle}
    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 })}>
    <Ionicons accessible={false} name={hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.accent} />
  </Pressable>;
}
