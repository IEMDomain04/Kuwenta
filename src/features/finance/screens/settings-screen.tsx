import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { FinanceScreen, ActionButton } from '../components/ui';
import { BackupExport } from '../components/backup-export';
import { BackupImportPreview } from '../components/backup-import-preview';
import { useFinance } from '../provider';

export default function SettingsScreen() {
  const { busy, resetData } = useFinance();
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
  return <FinanceScreen title="Settings">
    <ThemedText type="smallBold" accessibilityRole="header">Account Management</ThemedText>
    <ActionButton label="Manage accounts" disabled={busy} onPress={() => router.navigate('/accounts')} />
    <ThemedText type="smallBold" accessibilityRole="header">Planning</ThemedText>
    <ActionButton label="Budgets" disabled={busy} onPress={() => router.push('/budgets')} />
    <ActionButton label="Savings & Goals" disabled={busy} onPress={() => router.push('/goals')} />
    <ThemedText type="smallBold" accessibilityRole="header">Data and Backups</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Records stay on this device. Password-protected backups include accounts, transactions, savings goals, and budgets.</ThemedText>
    <BackupExport disabled={busy} />
    <BackupImportPreview disabled={busy} />
    <ThemedText type="smallBold" accessibilityRole="header">Start fresh</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Permanently clear Kuwenta records on this device and restart with Cash at zero. Export a backup above before resetting. There is no Undo.</ThemedText>
    <ActionButton label={resetting ? 'Resetting...' : 'Reset all data'} disabled={busy || resetting} onPress={confirmReset} />
    {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
    <ThemedText type="smallBold" accessibilityRole="header">Appearance</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Kuwenta uses a light interface.</ThemedText>
    <ThemedText type="smallBold" accessibilityRole="header">About Kuwenta</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Track, move, and save money in Philippine pesos.</ThemedText>
  </FinanceScreen>;
}
