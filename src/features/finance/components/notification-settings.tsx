import { useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { ActionButton } from './ui';
import { getNotificationSettings, saveNotificationSettings, notificationsAvailable, type NotificationSettings } from '../notifications';

export function NotificationSettingsPanel({ onboarding = false, onChanged }: { onboarding?: boolean; onChanged?: () => void | Promise<void> }) {
  const theme = useTheme();
  const [settings, setSettings] = useState(getNotificationSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save(next: NotificationSettings) {
    if (saving) return;
    setSaving(true); setError('');
    try { await saveNotificationSettings(next); setSettings(next); await onChanged?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update notifications.'); }
    finally { setSaving(false); }
  }
  if (!notificationsAvailable) return <ThemedText type="small" themeColor="textSecondary">{onboarding ? 'Get reminders to track your money and stay aware of your budgets.' : 'Notifications are unavailable on this device.'}</ThemedText>;
  const row = { minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 };
  return <View style={{ gap: 8 }}>
    <ThemedText type="small" themeColor="textSecondary">{onboarding ? 'Get reminders to track your money and stay aware of your budgets.' : 'Optional tracking reminders and budget alerts, even outside the app. Amounts stay hidden.'}</ThemedText>
    {onboarding ? <ActionButton primary label={settings.enabled ? 'Notifications enabled' : 'Enable notifications'} disabled={saving || settings.enabled} onPress={() => { void save({ ...settings, enabled: true }); }} /> : <View style={row}>
      <ThemedText type="small" style={{ flex: 1 }}>Allow notifications</ThemedText>
      <Switch accessibilityLabel="Allow notifications" value={settings.enabled} disabled={saving} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.backgroundElement} onValueChange={enabled => { void save({ ...settings, enabled }); }} />
    </View>}
    {settings.enabled && !onboarding ? <>
      {([['daily', 'Tracking reminders'], ['budgets', 'Budget alerts']] as const).map(([field, label]) => <View key={field} style={row}>
        <ThemedText type="small" style={{ flex: 1 }}>{label}</ThemedText><Switch accessibilityLabel={label} value={settings[field]} disabled={saving} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.backgroundElement} onValueChange={value => { void save({ ...settings, [field]: value }); }} />
      </View>)}
    </> : null}
    {error ? <><ThemedText type="small" themeColor="error" accessibilityRole="alert">{error}</ThemedText><ActionButton compact label="Open phone settings" onPress={() => { void Linking.openSettings(); }} /></> : null}
  </View>;
}
