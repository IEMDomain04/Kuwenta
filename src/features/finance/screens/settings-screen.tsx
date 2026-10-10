import { ThemedText } from '@/components/themed-text';
import { FinanceScreen } from '../components/ui';
import { AccountManager } from '../components/account-manager';
import { BackupExport } from '../components/backup-export';
import { BackupImportPreview } from '../components/backup-import-preview';
import { useFinance } from '../provider';

export default function SettingsScreen() {
  const { busy } = useFinance();
  return <FinanceScreen title="Settings">
    <AccountManager />
    <ThemedText type="smallBold" accessibilityRole="header">Backup & Restore</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Your records are stored on this device. Encrypted backups include all accounts and transactions.</ThemedText>
    <BackupExport disabled={busy} />
    <BackupImportPreview disabled={busy} />
  </FinanceScreen>;
}