import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { ActionButton } from './ui';

const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1))));
const years = Array.from({ length: 8100 }, (_, i) => i + 1900);
export function HomeMonthPicker() {
  const { month, currentMonth, setMonth } = useFinance();
  const theme = useTheme();
  const { height, fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const [choosingYear, setChoosingYear] = useState(false);
  const rowHeight = Math.max(52, Math.ceil(24 * fontScale) + 24);
  const label = months[Number(month.slice(5)) - 1] + ' ' + month.slice(0, 4);
  function select(value: string) { setMonth(value); setOpen(false); }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={'Choose reporting month, ' + label} onPress={() => { setYear(Number(month.slice(0, 4))); setChoosingYear(false); setOpen(true); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 12, backgroundColor: theme.backgroundElement }}>
      <ThemedText type="smallBold" themeColor="accent">{label}</ThemedText><Ionicons name="chevron-down" color={theme.accent} size={16} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close month picker" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: height * 0.85 }}>
          <View accessibilityViewIsModal style={{ padding: 20, gap: 12 }}>
            <ThemedText type="smallBold" accessibilityRole="header">Choose reporting month</ThemedText>
            <ActionButton icon={choosingYear ? 'arrow-back' : 'chevron-down'} label={choosingYear ? 'Back to months | ' + year : 'Year: ' + year} onPress={() => setChoosingYear(!choosingYear)} />
            {choosingYear ? <FlatList style={{ height: Math.min(height * 0.45, 320) }} data={years} keyExtractor={String}
              initialScrollIndex={year - 1900} getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
              renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item === year }} onPress={() => { setYear(item); setChoosingYear(false); }}
                style={{ height: rowHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: item === year ? theme.backgroundSelected : theme.backgroundElement }}>
                <ThemedText>{item}</ThemedText>
              </Pressable>} />
              : <ScrollView style={{ maxHeight: height * 0.45 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {months.map((name, index) => {
                  const value = String(year) + '-' + String(index + 1).padStart(2, '0');
                  const selected = value === month;
                  return <Pressable key={name} accessibilityRole="button" accessibilityLabel={name + ' ' + year} accessibilityState={{ selected }} onPress={() => select(value)}
                    style={{ flexBasis: '30%', flexGrow: 1, minHeight: rowHeight, padding: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.accent : theme.backgroundSelected }}>
                    <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }}>{name}</ThemedText>
                  </Pressable>;
                })}
              </View></ScrollView>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <ActionButton compact label="Current month" onPress={() => select(currentMonth)} />
              <ActionButton compact label="Cancel" onPress={() => setOpen(false)} />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}