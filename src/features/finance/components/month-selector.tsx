import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { adjacentMonth } from '../reporting';
import { ActionButton } from './ui';
export function MonthSelector() {
  const { month, currentMonth, setMonth } = useFinance();
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const label = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-01T12:00:00Z'));
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Reporting month: ' + label + '. Show month controls'} accessibilityState={{ expanded }}
      onPress={() => setExpanded(!expanded)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ThemedText themeColor="accent" accessibilityLiveRegion="polite">{label}</ThemedText>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={theme.accent} size={18} />
    </Pressable>
    {expanded && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <ActionButton compact label="Previous" disabled={month === '1900-01'} onPress={() => setMonth(adjacentMonth(month, -1))} />
      <ActionButton compact label="Next" disabled={month === '9999-12'} onPress={() => setMonth(adjacentMonth(month, 1))} />
      <ActionButton compact label="Current month" disabled={month === currentMonth} onPress={() => setMonth(currentMonth)} />
    </View>}
  </View>;
}