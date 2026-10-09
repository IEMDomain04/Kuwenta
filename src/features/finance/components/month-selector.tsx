import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useFinance } from '../provider';
import { adjacentMonth } from '../reporting';
import { ActionButton } from './ui';
export function MonthSelector() {
  const { month, currentMonth, setMonth } = useFinance();
  return <View style={{ gap: 8 }}>
    <ThemedText type="smallBold" accessibilityLiveRegion="polite">Reporting month: {month} (Philippine time)</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <ActionButton label="Previous" disabled={month === '1900-01'} onPress={() => setMonth(adjacentMonth(month, -1))} />
      <ActionButton label="Next" disabled={month === '9999-12'} onPress={() => setMonth(adjacentMonth(month, 1))} />
      <ActionButton label="Current month" disabled={month === currentMonth} onPress={() => setMonth(currentMonth)} />
    </View>
  </View>;
}
