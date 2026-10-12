import { useEffect, useRef, useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { shareBackup } from '../backup-files';
import { useFinance } from '../provider';
import { ActionButton } from './ui';

export function BackupExport({ disabled = false }: { disabled?: boolean }) {
  const { busy, getBackupJson, showNotice } = useFinance();
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  const cancellation = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancellation.current?.abort(); };
  }, []);

  async function exportFile() {
    if (pending.current || busy || disabled) return;
    pending.current = true;
    const controller = new AbortController();
    cancellation.current = controller;
    setExporting(true);
    setMessage('Preparing backup...');
    try {
      const json = await getBackupJson();
      if (!mounted.current) return;
      await shareBackup(json, progress => { if (mounted.current) setMessage(progress); }, controller.signal);
      if (mounted.current) showNotice('Sharing closed. Check your saved file.');
    } catch (error) {
      if (mounted.current) showNotice(error instanceof Error ? error.message : 'Could not export backup. Please try again.', true);
    } finally {
      pending.current = false;
      cancellation.current = null;
      if (mounted.current) { setExporting(false); setMessage(''); }
    }
  }
  return <>
    <ThemedText type="smallBold">Backup</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Save your accounts, transactions, budgets, and goals. The file has no password; keep it somewhere private.</ThemedText>
    <ActionButton label={exporting ? 'Preparing backup...' : 'Export backup'} disabled={busy || disabled || exporting} onPress={() => { void exportFile(); }} />
    {message ? <ThemedText type="small" accessibilityLiveRegion="polite">{message}</ThemedText> : null}
  </>;
}
