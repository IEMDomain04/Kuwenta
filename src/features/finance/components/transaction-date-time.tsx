import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useTheme } from '@/hooks/use-theme';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { philippineDateTime, pickedTransactionTime, formatTransactionDateTime, transactionPickerValue } from '../dates';
import { ActionButton } from './ui';

type Props = { dateOnly?: boolean; optional?: boolean; date: string; time: string; disabled: boolean; onDateChange: (date: string) => void; onTimeChange: (time: string) => void };
export function TransactionDateTime({ dateOnly = false, optional = false, date, time, disabled, onDateChange, onTimeChange }: Props) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const [picker, setPicker] = useState<{ mode: 'date' | 'time'; value: Date } | null>(null);
  const opened = useRef<'date' | 'time' | null>(null);
  useEffect(() => () => {
    if (Platform.OS === 'android' && opened.current) DateTimePickerAndroid.dismiss(opened.current);
  }, []);
  function apply(mode: 'date' | 'time', value: Date) {
    if (mode === 'date') onDateChange(philippineDateTime(value).transactionDate);
    else onTimeChange(pickedTransactionTime(value, time));
  }
  function open(mode: 'date' | 'time') {
    if (disabled || opened.current || picker) return;
    Keyboard.dismiss();
    const value = transactionPickerValue(date || philippineDateTime().transactionDate, time);
    if (Platform.OS === 'android') {
      opened.current = mode;
      DateTimePickerAndroid.open({
        value, mode, display: mode === 'date' ? 'calendar' : 'clock', is24Hour: true,
        timeZoneName: 'Asia/Manila',
        minimumDate: new Date('1900-01-01T00:00:00+08:00'),
        maximumDate: new Date('9999-12-31T23:59:59+08:00'),
        onValueChange: (_event, chosen) => { opened.current = null; apply(mode, chosen); },
        onDismiss: () => { opened.current = null; },
      });
    } else setPicker({ mode, value });
  }
  return <>
    <ThemedText type="smallBold">{dateOnly ? optional ? "Target date (optional)" : "Target date" : "Date and Time"}</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(dateOnly ? ['date'] as const : ['date', 'time'] as const).map((mode) => <Pressable key={mode} accessibilityRole="button" accessibilityLabel={dateOnly ? 'Choose target date' : 'Choose transaction ' + mode} accessibilityState={{ disabled: disabled || Boolean(picker) }} disabled={disabled || Boolean(picker)}
        onPress={() => open(mode)} style={({ pressed }) => ({ flex: 1, minWidth: mode === 'date' ? 150 : 120, minHeight: 48, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed || disabled ? 0.5 : 1 })}>
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={22} color={theme.textSecondary} />
        <ThemedText type="small" numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>{!date && optional ? 'Choose a date' : formatTransactionDateTime(date, time).split(' · ')[mode === 'date' ? 0 : 1]}</ThemedText>
        <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
      </Pressable>)}
    </View>
    {picker ? <View style={{ gap: 8 }}>
      <DateTimePicker themeVariant={scheme} mode={picker.mode} value={picker.value} timeZoneName="Asia/Manila"
        display={picker.mode === 'date' ? 'inline' : 'spinner'}
        minimumDate={new Date('1900-01-01T00:00:00+08:00')}
        maximumDate={new Date('9999-12-31T23:59:59+08:00')}
        onValueChange={(_event, value) => setPicker({ ...picker, value })} />
      <ActionButton label="Confirm selection" disabled={disabled} onPress={() => { apply(picker.mode, picker.value); setPicker(null); }} />
      <ActionButton label="Cancel selection" onPress={() => setPicker(null)} />
    </View> : null}
  </>;
}
