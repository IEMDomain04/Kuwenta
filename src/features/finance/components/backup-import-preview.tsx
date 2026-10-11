import { Colors } from '@/constants/theme';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { decryptBackup, pickBackupFile } from '../encrypted-backup';
import { previewBackup, type FinanceBackup } from '../backup';
import { formatMoney } from '../money';
import { philippineDateTime } from '../dates';
import { ActionButton } from './ui';
import { useFinance } from '../provider';

export function BackupImportPreview({ disabled = false }: { disabled?: boolean }) {
  const theme = useTheme();
  const { busy, restoreBackup } = useFinance();
  const confirming = useRef(false);
  const [restoring, setRestoring] = useState(false);
  const [selected, setSelected] = useState<{ name: string; json: string } | null>(null);
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState<{
    backup: FinanceBackup; summary: ReturnType<typeof previewBackup>; account: FinanceBackup['accounts'][number]; exported: string;
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
        backup, summary: previewBackup(backup), account: backup.accounts.find((account) => account.id === 'cash')!,
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
  function reviewRestore() {
    if (!preview || pending.current || confirming.current || disabled || busy) return;
    const backup = preview.backup;
    confirming.current = true;
    Keyboard.dismiss();
    Alert.alert('Replace your financial records?',
      'This replaces ALL your current accounts, transactions, savings goals, and budgets with this backup. Export your current records first if you want to keep a copy. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { confirming.current = false; } },
        { text: 'Restore backup', style: 'destructive', onPress: () => {
          if (!mounted.current) { confirming.current = false; return; }
          pending.current = true; setRestoring(true); setMessage('Restoring backup...');
          void restoreBackup(backup).then(() => {
            if (mounted.current) { clear(); setMessage('Backup restored.'); }
          }).catch((error: unknown) => {
            if (mounted.current) setMessage(error instanceof Error ? error.message : 'Restore failed. Your original records are unchanged.');
          }).finally(() => {
            confirming.current = false; pending.current = false;
            if (mounted.current) setRestoring(false);
          });
        } },
      ], { cancelable: false });
  }
  const locked = disabled || busy || working || restoring;
  return <>
    <ThemedText type="smallBold">Preview a backup</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Open an encrypted .kuwenta file to check its contents. This does not restore or change your current records.</ThemedText>
    <ActionButton label={working ? 'Checking backup...' : 'Choose backup file'} disabled={locked} onPress={() => { void chooseFile(); }} />
    {selected ? <>
      <ThemedText>Selected: {selected.name}</ThemedText>
      <TextInput selectionColor={Colors.light.accent} cursorColor={Colors.light.accent} selectionHandleColor={Colors.light.accent} underlineColorAndroid="transparent" accessibilityLabel="Password for selected backup" placeholder="Backup password"
        placeholderTextColor={theme.textSecondary} value={password} onChangeText={setPassword}
        secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!locked}
        style={{ color: theme.text, borderColor: theme.textSecondary, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 14 }} />
      <ActionButton label="Unlock and preview" disabled={locked} onPress={() => { void unlock(); }} />
    </> : null}
    {preview ? <>
      <ThemedText type="smallBold">Backup contents</ThemedText>
      <ThemedText>Exported: {preview.exported}</ThemedText>
      <ThemedText>Accounts: {preview.summary.accountCount} (PHP)</ThemedText>
      {preview.backup.accounts.map((account) => <ThemedText key={account.id} type="small">{account.name} · {account.purpose}{account.archived ? ' · Archived' : ''}</ThemedText>)}
      <ThemedText>Opening balance: {formatMoney(preview.account.openingBalance)}</ThemedText>
      <ThemedText>Transactions: {preview.summary.transactionCount}</ThemedText>
      <ThemedText>Income records: {preview.summary.incomeCount}</ThemedText>
      <ThemedText>Savings goals: {preview.summary.goalCount}</ThemedText>
      <ThemedText>Budgets: {preview.summary.budgetCount}</ThemedText>
      <ThemedText>Transfers: {preview.summary.transferCount}</ThemedText>
      <ThemedText>External movements: {preview.summary.externalCount}</ThemedText>
      <ThemedText>Balance adjustments: {preview.summary.adjustmentCount}</ThemedText>
      <ThemedText>Expense records: {preview.summary.expenseCount}</ThemedText>
      <ThemedText>Cash balance: {formatMoney(preview.summary.cashBalance)}</ThemedText>
      {preview.summary.cashBalance < 0 ? <ThemedText accessibilityRole="alert" style={{ color: theme.warning, backgroundColor: theme.warningSurface }}>Warning: this backup has a negative Cash balance.</ThemedText> : null}
      <ThemedText>Your current records have not changed. Restoring also replaces savings goals and budgets.</ThemedText>
      <ActionButton label={restoring ? "Restoring backup..." : "Restore this backup"} disabled={locked} onPress={reviewRestore} />
    </> : null}
    {selected || preview || working ? <ActionButton label={working ? 'Cancel preview' : 'Close preview'} disabled={restoring} onPress={clear} /> : null}
    {message ? <ThemedText accessibilityLiveRegion="polite">{message}</ThemedText> : null}
  </>;
}
