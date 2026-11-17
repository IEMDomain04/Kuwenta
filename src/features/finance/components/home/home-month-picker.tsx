import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../../provider';
import { ActionButton } from '../shared/ui';

const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1))));
const years = Array.from({ length: 8100 }, (_, i) => i + 1900);
export function HomeMonthPicker({ disabled = false, compact = false, fullWidth = false, value, onChange, open: controlledOpen, onOpenChange }: { disabled?: boolean; compact?: boolean; fullWidth?: boolean; value?: string; onChange?: (month: string) => void; open?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  const finance = useFinance();
  const month = value ?? finance.month, currentMonth = finance.currentMonth;
  const setMonth = onChange ?? finance.setMonth;
  const theme = useTheme();
  const { height, fontScale } = useWindowDimensions();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  function setOpen(value: boolean) { if (onOpenChange) onOpenChange(value); else setLocalOpen(value); }
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const [choosingYear, setChoosingYear] = useState(false);
  useEffect(() => { if (open) { setYear(Number(month.slice(0,4))); setChoosingYear(false); } },[open,month]);
  const rowHeight = Math.max(52, Math.ceil(24 * fontScale) + 24);
  const label = months[Number(month.slice(5)) - 1] + ' ' + month.slice(0, 4);
  function select(value: string) { if (disabled) return; setMonth(value); setOpen(false); }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={'Choose reporting month, ' + label} accessibilityState={{ disabled }} disabled={disabled} onPress={() => { setYear(Number(month.slice(0, 4))); setChoosingYear(false); setOpen(true); }}
      style={{ flexDirection: 'row', alignItems: 'center', ...(fullWidth ? { width: '100%', justifyContent: 'center' } as const : {}), gap: compact ? 4 : 6, minHeight: 44, paddingHorizontal: compact ? 8 : 10, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.backgroundElement }}>
      <Ionicons name="calendar-outline" size={compact ? 14 : 16} color={theme.accent} />
      <ThemedText type="smallBold" themeColor="accent" style={compact ? {fontSize:10,lineHeight:14} : undefined}>{label}</ThemedText><Ionicons name="chevron-down" color={theme.accent} size={compact ? 14 : 16} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close month picker" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: height * 0.85 }}>
          <View accessibilityViewIsModal style={{ padding: 20, gap: 12 }}>
            <ThemedText type="smallBold" accessibilityRole="header">Choose reporting month</ThemedText>
            <ActionButton icon={choosingYear ? 'arrow-back' : 'chevron-down'} disabled={disabled} label={choosingYear ? 'Back to months | ' + year : 'Year: ' + year} onPress={() => setChoosingYear(!choosingYear)} />
            {choosingYear ? <FlatList style={{ height: Math.min(height * 0.45, 320) }} data={years} keyExtractor={String}
              initialScrollIndex={year - 1900} getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
              renderItem={({ item }) => <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ selected: item === year, disabled }} onPress={() => { setYear(item); setChoosingYear(false); }}
                style={{ height: rowHeight, alignItems: 'center', justifyContent: 'center', backgroundColor: item === year ? theme.backgroundSelected : theme.backgroundElement }}>
                <ThemedText>{item}</ThemedText>
              </Pressable>} />
              : <ScrollView style={{ maxHeight: height * 0.45 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {months.map((name, index) => {
                  const value = String(year) + '-' + String(index + 1).padStart(2, '0');
                  const selected = value === month;
                  const current = value === currentMonth;
                  return <Pressable key={name} accessibilityRole="button" accessibilityLabel={name + ' ' + year} accessibilityHint={current ? 'Current calendar month' : undefined} disabled={disabled} accessibilityState={{ selected, disabled }} onPress={() => select(value)}
                    style={{ flexBasis: '30%', flexGrow: 1, minHeight: rowHeight, padding: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: selected ? theme.accent : 'transparent', backgroundColor: current ? theme.backgroundSelected : theme.backgroundElement }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><ThemedText type="smallBold" style={{ color: theme.text }}>{name}</ThemedText>{selected ? <Ionicons accessible={false} name="checkmark" size={14} color={theme.accent} /> : null}</View>
                    {current ? <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 10 }}>Current</ThemedText> : null}
                  </Pressable>;
                })}
              </View></ScrollView>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <ActionButton compact label="Cancel" onPress={() => setOpen(false)} />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </>;
}