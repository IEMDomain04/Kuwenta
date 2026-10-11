import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/themed-text';
import { FinanceScreen, ActionButton } from '../components/ui';
import { BackupExport } from '../components/backup-export';
import { BackupImportPreview } from '../components/backup-import-preview';
import { useFinance } from '../provider';

export default function SettingsScreen() {
  const { busy, resetData, displayName } = useFinance();
  const theme = useTheme();
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
  return <FinanceScreen title="Settings">
    <View style={section}>
    <ThemedText type="smallBold" accessibilityRole="header">Profile</ThemedText>
    <ThemedText type="small">{displayName || 'Kuwenta user'}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Philippine Peso (PHP)</ThemedText>
    <ActionButton label="Manage accounts" disabled={busy} onPress={() => router.navigate('/accounts')} />
    </View><View style={section}>
    <ThemedText type="smallBold" accessibilityRole="header">Budgets & Goals</ThemedText>
    <ActionButton label="Budgets" disabled={busy} onPress={() => router.push('/budgets')} />
    <ActionButton label="Savings & Goals" disabled={busy} onPress={() => router.push('/goals')} />
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
  </FinanceScreen>;
}
