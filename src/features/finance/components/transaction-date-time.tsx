import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { philippineDateTime, pickedTransactionTime, readableTransactionDate, transactionPickerValue } from '../dates';
import { ActionButton } from './ui';

type Props = { date: string; time: string; disabled: boolean; onDateChange: (date: string) => void; onTimeChange: (time: string) => void };
export function TransactionDateTime({ date, time, disabled, onDateChange, onTimeChange }: Props) {
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
    const value = transactionPickerValue(date, time);
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
    <ThemedText>Transaction date · PH (UTC+8)</ThemedText>
    <ActionButton label={readableTransactionDate(date)} disabled={disabled || Boolean(picker)} onPress={() => open('date')} />
    <ThemedText>Transaction time · PH (UTC+8)</ThemedText>
    <ActionButton label={time + ' · 24-hour time'} disabled={disabled || Boolean(picker)} onPress={() => open('time')} />
    {picker ? <View style={{ gap: 8 }}>
      <DateTimePicker mode={picker.mode} value={picker.value} timeZoneName="Asia/Manila"
        display={picker.mode === 'date' ? 'inline' : 'spinner'}
        minimumDate={new Date('1900-01-01T00:00:00+08:00')}
        maximumDate={new Date('9999-12-31T23:59:59+08:00')}
        onValueChange={(_event, value) => setPicker({ ...picker, value })} />
      <ActionButton label="Confirm selection" disabled={disabled} onPress={() => { apply(picker.mode, picker.value); setPicker(null); }} />
      <ActionButton label="Cancel selection" onPress={() => setPicker(null)} />
    </View> : null}
  </>;
}
