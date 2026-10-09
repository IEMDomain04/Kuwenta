import { useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { editMoneyInput } from '../inputs';

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'selection' | 'onSelectionChange'> & {
  value: string; signed?: boolean; onValueChange: (value: string) => void; onRejected: () => void;
};
export function MoneyField({ value, signed = false, onValueChange, onRejected, ...props }: Props) {
  const caret = useRef({ start: value.length, end: value.length });
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  return <TextInput {...props} value={value} selection={selection} keyboardType="decimal-pad"
    onSelectionChange={(event) => { caret.current = event.nativeEvent.selection; setSelection(event.nativeEvent.selection); }}
    onChangeText={(next) => {
      const edit = editMoneyInput(value, next, caret.current, signed);
      if (!edit) { onRejected(); return; }
      caret.current = { start: edit.cursor, end: edit.cursor };
      onValueChange(edit.value);
      setSelection(caret.current);
    }} />;
}
