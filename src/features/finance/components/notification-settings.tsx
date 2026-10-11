import { Ionicons } from '@react-native-vector-icons/ionicons';
import { SelectionSheet } from './selection-sheet';
import { useState } from 'react';
import { Linking, Pressable, Switch, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { ActionButton } from './ui';
import { getNotificationSettings, saveNotificationSettings, notificationsAvailable, type NotificationSettings } from '../notifications';

export function NotificationSettingsPanel({ onboarding = false, onChanged }: { onboarding?: boolean; onChanged?: () => void | Promise<void> }) {
  const theme = useTheme();
  const [settings, setSettings] = useState(getNotificationSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [windowOpen, setWindowOpen] = useState(false);
  const windows = [{ value: '12', label: '12-2 PM' }, { value: '17', label: '5-7 PM' }, { value: '19', label: '7-9 PM' }];
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
    <ThemedText type="small" themeColor="textSecondary">{onboarding ? 'Get reminders to track your money and stay aware of your budgets.' : 'Optional daily reminders and budget alerts, even outside the app. Amounts stay hidden.'}</ThemedText>
    {onboarding ? <ActionButton primary label={settings.enabled ? 'Notifications enabled' : 'Enable notifications'} disabled={saving || settings.enabled} onPress={() => { void save({ ...settings, enabled: true }); }} /> : <View style={row}>
      <ThemedText type="small" style={{ flex: 1 }}>Allow notifications</ThemedText>
      <Switch accessibilityLabel="Allow notifications" value={settings.enabled} disabled={saving} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.backgroundElement} onValueChange={enabled => { void save({ ...settings, enabled }); }} />
    </View>}
    {settings.enabled && !onboarding ? <>
      {([['daily', 'Daily tracking reminder'], ['budgets', 'Budget alerts']] as const).map(([field, label]) => <View key={field} style={row}>
        <ThemedText type="small" style={{ flex: 1 }}>{label}</ThemedText><Switch accessibilityLabel={label} value={settings[field]} disabled={saving} trackColor={{ false: theme.border, true: theme.accent }} thumbColor={theme.backgroundElement} onValueChange={value => { void save({ ...settings, [field]: value }); }} />
      </View>)}
      {settings.daily ? <>
        <ThemedText type="smallBold">Reminder window (Philippine time)</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose reminder window" disabled={saving} onPress={() => setWindowOpen(true)} style={{ minHeight: 48, paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.background, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText type="small" style={{ flex: 1 }}>{windows.find(option => option.value === String(settings.start))?.label}</ThemedText>
          <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
        </Pressable>
        <SelectionSheet visible={windowOpen} title="Reminder window" options={windows} selected={String(settings.start)} disabled={saving} onSelect={value => { void save({ ...settings, start: Number(value) }); }} onClose={() => setWindowOpen(false)} />
        <ThemedText type="small" themeColor="textSecondary">Once daily at a varied time. Skipped when you have already logged a transaction.</ThemedText>
      </> : null}
    </> : null}
    {error ? <><ThemedText type="small" themeColor="error" accessibilityRole="alert">{error}</ThemedText><ActionButton compact label="Open phone settings" onPress={() => { void Linking.openSettings(); }} /></> : null}
  </View>;
}
