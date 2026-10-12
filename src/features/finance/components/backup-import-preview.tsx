import { FieldError } from './field-error';
import { useConfirmation } from './confirmation';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { pickBackupFile } from '../backup-files';
import { previewBackup, type FinanceBackup } from '../backup';
import { calculateCurrentMoney } from '../calculations';
import { formatMoney } from '../money';
import { philippineDateTime } from '../dates';
import { ActionButton } from './ui';

export function BackupImportPreview({ disabled = false, busy = false, onRestore: restoreBackup, onNotice: showNotice, recovery = false }: {
  disabled?: boolean; busy?: boolean; recovery?: boolean;
  onRestore: (backup: FinanceBackup) => Promise<void>;
  onNotice: (message: string, error?: boolean) => void;
}) {
  const theme = useTheme();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const confirmation = useConfirmation();
  const confirming = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  const [restoring, setRestoring] = useState(false);
  const [selected, setSelected] = useState<{ name: string; json: string } | null>(null);
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState<{
    backup: FinanceBackup; summary: ReturnType<typeof previewBackup>; total: number; name: string; exported: string;
  } | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; };
  }, []);
  function clear() {
    generation.current++;
    setSelected(null); setPassword(''); setFieldErrors({}); setPreview(null); setMessage('');
  }
  function showPreview(backup: FinanceBackup, name: string) {
    const time = philippineDateTime(new Date(backup.exportedAt));
    setPreview({
      backup, name, summary: previewBackup(backup),
      total: calculateCurrentMoney(backup.accounts, backup.transactions).totalMoney,
      exported: time.transactionDate + ' ' + time.transactionTime + ' PH',
    });
    setSelected(null); setMessage('');
  }
  async function chooseFile() {
    if (pending.current || disabled || busy || confirming.current) return;
    pending.current = true; setWorking(true); clear();
    const token = generation.current;
    try {
      const file = await pickBackupFile();
      if (file && mounted.current && token === generation.current) {
        if (file.backup) showPreview(file.backup, file.name);
        else setSelected(file);
      }
    } catch (error) {
      if (mounted.current && token === generation.current) showNotice(error instanceof Error ? error.message : 'Could not open backup.', true);
    } finally {
      pending.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  async function unlock() {
    if (pending.current || disabled || busy || !selected) return;
    pending.current = true; setWorking(true); setMessage('Checking backup...');
    const token = generation.current;
    const enteredPassword = password;
    Keyboard.dismiss();
    try {
      const { decryptBackup, validateBackupPassword } = await import('../encrypted-backup');
      validateBackupPassword(enteredPassword);
      setPassword('');
      const backup = await decryptBackup(selected.json, enteredPassword);
      if (mounted.current && token === generation.current) showPreview(backup, selected.name);
    } catch (error) {
      if (mounted.current && token === generation.current) {
        setMessage(''); setFieldErrors({ password: error instanceof Error ? error.message : 'Could not unlock backup.' }); showNotice(error instanceof Error ? error.message : 'Could not preview backup.', true);
        passwordInput.current?.focus();
      }
    } finally {
      pending.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  function reviewRestore() {
    if (!preview || pending.current || confirming.current || disabled || busy) return;
    const backup = preview.backup;
    confirming.current = true;
    Keyboard.dismiss();
    confirmation.alert(recovery ? 'Recover records from this backup?' : 'Replace current records?',
      recovery ? 'Kuwenta will use the records in this backup. Changes made after its export will not be recovered. The inaccessible database will be kept on this device. Continue?'
        : 'This replaces your accounts, transactions, budgets, and goals with this backup. Changes made after its export will be lost. Export your current records first if you want to keep them.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { confirming.current = false; } },
        { text: recovery ? 'Restore' : 'Replace', style: 'destructive', onPress: () => {
          if (!mounted.current) { confirming.current = false; return; }
          pending.current = true; setRestoring(true); setMessage('Restoring backup...');
          void restoreBackup(backup).then(() => {
            if (mounted.current) clear();
          }).catch((error: unknown) => {
            if (mounted.current) { setMessage(''); showNotice(error instanceof Error ? error.message : 'Could not restore backup.', true); }
          }).finally(() => {
            confirming.current = false; pending.current = false;
            if (mounted.current) setRestoring(false);
          });
        } },
      ], { icon: 'cloud-download-outline', rows: [{ label: 'Backup', value: preview.name }, { label: 'Exported', value: preview.exported }, { label: 'Accounts / records', value: preview.summary.accountCount + ' / ' + preview.summary.transactionCount }, { label: 'Budgets / goals', value: preview.summary.budgetCount + ' / ' + preview.summary.goalCount }] });
  }
  const locked = disabled || busy || working || restoring;
  return <>
    <ThemedText type="smallBold">{recovery ? 'Recover from backup' : 'Import backup'}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Choose a Kuwenta JSON or Excel backup, review it, then confirm replacement.</ThemedText>
    <ActionButton label={working ? 'Checking backup...' : 'Choose backup file'} disabled={locked} onPress={() => { void chooseFile(); }} />
    {selected ? <>
      <ThemedText type="small">This older backup is protected. Enter its original password.</ThemedText>
      <TextInput ref={passwordInput} selectionColor={theme.accent} cursorColor={theme.accent} selectionHandleColor={theme.accent} underlineColorAndroid="transparent" accessibilityLabel="Password for older backup" placeholder="Original backup password"
        placeholderTextColor={theme.textSecondary} value={password} onChangeText={value => { setPassword(value); setFieldErrors({}); }}
        secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!locked}
        style={{ color: theme.text, borderColor: fieldErrors.password ? theme.error : theme.textSecondary, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 14 }} />
      <FieldError message={fieldErrors.password} />
      <ActionButton label="Unlock and preview" disabled={locked} onPress={() => { void unlock(); }} />
    </> : null}
    {preview ? <>
      <ThemedText type="smallBold">Backup contents</ThemedText>
      <ThemedText type="small" numberOfLines={1}>{preview.name}</ThemedText>
      <ThemedText type="small">Exported: {preview.exported}</ThemedText>
      <ThemedText type="small">{preview.summary.accountCount} accounts ? {preview.summary.transactionCount} records</ThemedText>
      <ThemedText type="small">{preview.summary.budgetCount} budgets ? {preview.summary.goalCount} savings goals</ThemedText>
      <ThemedText type="small">Total money: {formatMoney(preview.total, true)}</ThemedText>
      <ThemedText type="small">Cash balance: {formatMoney(preview.summary.cashBalance, true)}</ThemedText>
      {preview.summary.cashBalance < 0 ? <ThemedText type="small" accessibilityRole="alert" themeColor="warning">This backup has a negative Cash balance.</ThemedText> : null}
      <ActionButton label={restoring ? 'Restoring backup...' : recovery ? 'Restore this backup' : 'Replace current records'} disabled={locked} onPress={reviewRestore} />
    </> : null}
    {selected || preview || working ? <ActionButton label={working ? 'Cancel preview' : 'Close preview'} disabled={restoring} onPress={clear} /> : null}
    {message ? <ThemedText type="small" accessibilityLiveRegion="polite">{message}</ThemedText> : null}
  </>;
}
