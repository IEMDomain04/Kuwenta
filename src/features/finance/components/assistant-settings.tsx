import { View, Switch } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { assistantAvailability, assistantModel } from '../offline-assistant';

export function AssistantSettings() {
  const { assistantEnabled, saveAssistantEnabled, busy, showNotice } = useFinance();
  const theme = useTheme();
  const unavailable = assistantAvailability();
  return <View style={{ padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <ThemedText type="smallBold" accessibilityRole="header" style={{ flex: 1 }}>Offline assistant</ThemedText>
      <Switch accessibilityLabel="Enable offline assistant" value={assistantEnabled} disabled={busy} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.onAccent}
        onValueChange={enabled => { void saveAssistantEnabled(enabled).catch(cause => showNotice(cause instanceof Error ? cause.message : 'Could not update the assistant.', true)); }} />
    </View>
    <ThemedText type="small">{unavailable ?? (assistantEnabled ? 'Ready when you open chat' : 'Disabled')}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">{assistantModel.name} | Bundled model: {Math.round(assistantModel.bytes / 1_000_000)} MB</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Works offline and loads when you ask. Disabling hides assistant features and keeps the bundled model installed.</ThemedText>
  </View>;
}
