import type { ComponentProps } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function SelectionSheet({ visible, title, options, selected, disabled, onSelect, onClose }: {
  visible: boolean; title: string; options: { value: string; label: string; icon?: ComponentProps<typeof Ionicons>['name'] }[]; selected?: string;
  disabled: boolean; onSelect: (value: string) => void; onClose: () => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close selection" onPress={onClose} style={{ flex: 1 }} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={{ maxHeight: height * 0.8, backgroundColor: theme.backgroundElement, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <View accessibilityViewIsModal style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ThemedText type="smallBold" accessibilityRole="header" style={{ flex: 1 }}>{title}</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close selection" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={20} color={theme.text} /></Pressable>
          </View>
          <ScrollView style={{ maxHeight: height * 0.55 }} keyboardShouldPersistTaps="handled">
            {options.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: selected === option.value, disabled }} disabled={disabled} onPress={() => { onSelect(option.value); onClose(); }} style={{ minHeight: 48, padding: 12, borderRadius: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: selected === option.value ? theme.backgroundSelected : theme.background }}>
              {option.icon ? <Ionicons name={option.icon} size={20} color={selected === option.value ? theme.accent : theme.textSecondary} /> : null}
              <ThemedText type="small" numberOfLines={2} ellipsizeMode="tail" style={{ flex: 1 }}>{option.label}</ThemedText>
              {selected === option.value ? <Ionicons name="checkmark-circle" size={18} color={theme.accent} /> : null}
            </Pressable>)}
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}
