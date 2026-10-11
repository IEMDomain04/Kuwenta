import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import { FinanceScreen, ActionButton } from '../components/ui';
import { BackupExport } from '../components/backup-export';
import { BackupImportPreview } from '../components/backup-import-preview';
import { useFinance } from '../provider';

export default function SettingsScreen() {
  const { busy, resetData, displayName, saveDisplayName } = useFinance();
  const theme = useTheme();
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const namePending = useRef(false);
  async function saveName() {
    if (namePending.current || busy) return;
    if (!name.trim()) { setNameError('Please enter your name.'); return; }
    namePending.current = true; setSavingName(true); setNameError('');
    try { await saveDisplayName(name); setNameOpen(false); }
    catch (cause) { setNameError(cause instanceof Error ? cause.message : 'Could not save your name.'); }
    finally { namePending.current = false; setSavingName(false); }
  }
  const section = { padding: 14, borderRadius: 18, backgroundColor: theme.backgroundElement, gap: 8 };
  const pending = useRef(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  function confirmReset() {
    if (pending.current || busy) return;
    pending.current = true;
    Alert.alert('Reset all Kuwenta data?', 'Permanently remove all accounts, opening balances, transactions, transfers, adjustments, savings goals, budgets, and saved account preferences on this device. A fresh Cash account will start at zero. This cannot be undone. Export a backup first if you want to keep your records. Exported backup files are not deleted.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: 'Reset all data', style: 'destructive', onPress: () => {
        setResetting(true); setError('');
        void resetData().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not reset data.')).finally(() => { pending.current = false; setResetting(false); });
      } },
    ], { cancelable: false });
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><FinanceScreen title="Settings">
    <View style={section}>
    <ThemedText type="smallBold" accessibilityRole="header">Profile</ThemedText>
    <Pressable accessibilityRole="button" accessibilityLabel="Edit your name" disabled={busy} onPress={() => { setName(displayName ?? ''); setNameError(''); setNameOpen(true); }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View><ThemedText type="smallBold">Your name</ThemedText><ThemedText type="small" themeColor="textSecondary">{displayName || 'Set your name'}</ThemedText></View>
      <ThemedText type="smallBold" themeColor="accent">Edit</ThemedText>
    </Pressable>
    <Modal visible={nameOpen} transparent animationType="fade" onRequestClose={() => { if (!namePending.current) setNameOpen(false); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', padding: 24 }}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flexShrink: 1, width: '100%', maxWidth: 420, alignSelf: 'center' }} contentContainerStyle={{ paddingVertical: 12 }}>
        <View accessibilityViewIsModal style={{ backgroundColor: theme.backgroundElement, borderRadius: 20, padding: 20, gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <ThemedText type="smallBold" accessibilityRole="header">Your name</ThemedText>
          <TextInput accessibilityLabel="Your name" value={name} maxLength={50} editable={!savingName && !busy} onChangeText={(value) => { setName(value); setNameError(''); }} autoCapitalize="words" placeholder="Your name" placeholderTextColor={theme.textSecondary} style={{ color: theme.text, fontSize: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14 }} />
          {nameError ? <ThemedText type="small" accessibilityRole="alert" themeColor="error">{nameError}</ThemedText> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><ActionButton label="Cancel" disabled={savingName || busy} onPress={() => setNameOpen(false)} /></View>
            <View style={{ flex: 1 }}><ActionButton primary label={savingName ? 'Saving...' : 'Save'} disabled={savingName || busy} onPress={() => { void saveName(); }} /></View>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
    <ThemedText type="small" themeColor="textSecondary">Philippine Peso (PHP)</ThemedText>
    <ActionButton label="Manage accounts" disabled={busy} onPress={() => router.navigate('/accounts')} />
    </View><View style={section}>
    <ThemedText type="smallBold" accessibilityRole="header">Backup & Restore</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Records stay on this device. Password-protected backups include accounts, transactions, savings goals, and budgets.</ThemedText>
    <BackupExport disabled={busy} />
    <BackupImportPreview disabled={busy} />
    <ThemedText type="small" themeColor="textSecondary">Restoring replaces current financial records. Export a backup first to keep them.</ThemedText>
    </View><View style={section}>
    <ThemedText type="smallBold" accessibilityRole="header">Reset App</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Permanently clear Kuwenta records on this device and restart with Cash at zero. Export a backup above before resetting. There is no Undo.</ThemedText>
    <ActionButton label={resetting ? 'Resetting...' : 'Reset all data'} disabled={busy || resetting} onPress={confirmReset} />
    {error ? <ThemedText accessibilityRole="alert" style={{ color: theme.error, backgroundColor: theme.errorSurface }}>{error}</ThemedText> : null}
    </View>
    <ThemedText type="smallBold" accessibilityRole="header">About Kuwenta</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Track, move, and save money in Philippine pesos.</ThemedText>
  </FinanceScreen></KeyboardAvoidingView>;
}
