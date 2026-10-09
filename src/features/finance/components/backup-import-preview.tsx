import { useEffect, useRef, useState } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { decryptBackup, pickBackupFile } from '../encrypted-backup';
import { previewBackup, type FinanceBackup } from '../backup';
import { formatMoney } from '../money';
import { philippineDateTime } from '../dates';
import { ActionButton } from './ui';

export function BackupImportPreview({ disabled = false }: { disabled?: boolean }) {
  const theme = useTheme();
  const [selected, setSelected] = useState<{ name: string; json: string } | null>(null);
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState<{
    summary: ReturnType<typeof previewBackup>; account: FinanceBackup['accounts'][number]; exported: string;
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
    setSelected(null); setPassword(''); setPreview(null); setMessage('');
  }
  async function chooseFile() {
    if (pending.current || disabled) return;
    pending.current = true; setWorking(true); clear();
    const token = generation.current;
    try {
      const file = await pickBackupFile();
      if (mounted.current && token === generation.current) setSelected(file);
    } catch (error) {
      if (mounted.current && token === generation.current) setMessage(error instanceof Error ? error.message : 'Could not open backup.');
    } finally {
      pending.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  async function unlock() {
    if (pending.current || disabled || !selected) return;
    pending.current = true; setWorking(true); setMessage('Unlocking and checking backup...');
    const token = generation.current;
    const enteredPassword = password;
    setPassword(''); Keyboard.dismiss();
    try {
      const backup = await decryptBackup(selected.json, enteredPassword);
      const time = philippineDateTime(new Date(backup.exportedAt));
      const result = {
        summary: previewBackup(backup), account: backup.accounts[0],
        exported: time.transactionDate + ' ' + time.transactionTime + ' PH (UTC+8)',
      };
      if (mounted.current && token === generation.current) {
        setPreview(result); setSelected(null); setMessage('');
      }
    } catch (error) {
      if (mounted.current && token === generation.current) setMessage(error instanceof Error ? error.message : 'Could not preview backup.');
    } finally {
      pending.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  const locked = disabled || working;
  return <>
    <ThemedText type="smallBold">Preview a backup</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Open an encrypted .kuwenta file to check its contents. This does not restore or change your current records.</ThemedText>
    <ActionButton label={working ? 'Checking backup...' : 'Choose backup file'} disabled={locked} onPress={() => { void chooseFile(); }} />
    {selected ? <>
      <ThemedText>Selected: {selected.name}</ThemedText>
      <TextInput accessibilityLabel="Password for selected backup" placeholder="Backup password"
        placeholderTextColor={theme.textSecondary} value={password} onChangeText={setPassword}
        secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!locked}
        style={{ color: theme.text, borderColor: theme.textSecondary, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16 }} />
      <ActionButton label="Unlock and preview" disabled={locked} onPress={() => { void unlock(); }} />
    </> : null}
    {preview ? <>
      <ThemedText type="smallBold">Backup contents</ThemedText>
      <ThemedText>Exported: {preview.exported}</ThemedText>
      <ThemedText>Account: {preview.account.name} (PHP)</ThemedText>
      <ThemedText>Opening balance: {formatMoney(preview.account.openingBalance)}</ThemedText>
      <ThemedText>Transactions: {preview.summary.transactionCount}</ThemedText>
      <ThemedText>Income records: {preview.summary.incomeCount}</ThemedText>
      <ThemedText>Expense records: {preview.summary.expenseCount}</ThemedText>
      <ThemedText>Cash balance: {formatMoney(preview.summary.cashBalance)}</ThemedText>
      {preview.summary.cashBalance < 0 ? <ThemedText accessibilityRole="alert">Warning: this backup has a negative Cash balance.</ThemedText> : null}
      <ThemedText>Your current records have not changed.</ThemedText>
    </> : null}
    {selected || preview || working ? <ActionButton label={working ? 'Cancel preview' : 'Close preview'} onPress={clear} /> : null}
    {message ? <ThemedText accessibilityLiveRegion="polite">{message}</ThemedText> : null}
  </>;
}
