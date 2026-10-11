import { Colors } from '@/constants/theme';
import { useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { editMoneyInput } from '../inputs';

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'selection' | 'onSelectionChange'> & {
  value: string; signed?: boolean; onValueChange: (value: string) => void; onRejected: () => void;
};
export function MoneyField({ value, signed = false, onValueChange, onRejected, ...props }: Props) {
  const caret = useRef({ start: value.length, end: value.length });
  const pendingCaret = useRef<{ start: number; end: number } | undefined>(undefined);
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  return <TextInput selectionColor={Colors.light.accent} cursorColor={Colors.light.accent} selectionHandleColor={Colors.light.accent} underlineColorAndroid="transparent" {...props} value={value} selection={selection} keyboardType="decimal-pad"
    selectTextOnFocus={/^-?0+(?:\.0{1,2})?$/.test(value.replace(/,/g, ''))}
    onSelectionChange={(event) => {
      const next = event.nativeEvent.selection;
      // Ignore the native position from before a comma-formatting correction.
      if (pendingCaret.current) {
        if (next.start !== pendingCaret.current.start || next.end !== pendingCaret.current.end) return;
        pendingCaret.current = undefined;
        setSelection(undefined);
      }
      caret.current = next;
    }}
    onChangeText={(next) => {
      const edit = editMoneyInput(value, next, caret.current, signed);
      if (!edit) { onRejected(); return; }
      caret.current = { start: edit.cursor, end: edit.cursor };
      // Let native typing manage selection unless formatting changes the text.
      pendingCaret.current = edit.value !== next ? caret.current : undefined;
      setSelection(pendingCaret.current);
      onValueChange(edit.value);
    }} />;
}