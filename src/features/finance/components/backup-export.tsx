import { Colors } from '@/constants/theme';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { shareEncryptedBackup, validateBackupPassword } from '../encrypted-backup';
import { useFinance } from '../provider';
import { ActionButton } from './ui';

export function BackupExport({ disabled = false }: { disabled?: boolean }) {
  const { busy, getBackupJson } = useFinance();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function exportFile() {
    if (pending.current || busy || disabled) return;
    try {
      validateBackupPassword(password);
      if (password !== confirmation) throw new Error('The passwords must match.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check your password.');
      return;
    }
    pending.current = true;
    setExporting(true);
    setMessage('Preparing encrypted backup...');
    Keyboard.dismiss();
    const enteredPassword = password;
    setPassword('');
    setConfirmation('');
    try {
      const json = await getBackupJson();
      await shareEncryptedBackup(json, enteredPassword);
      if (mounted.current) {
        setOpen(false);
        setMessage('Sharing closed. Check that you saved the backup in your chosen location.');
      }
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : 'Could not export backup. Please try again.');
    } finally {
      pending.current = false;
      if (mounted.current) setExporting(false);
    }
  }

  const locked = busy || disabled || exporting;
  const inputStyle = { color: theme.text, borderColor: theme.textSecondary, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 14 };
  return <>
    <ThemedText type="smallBold">Backup</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Save a password-protected copy of all your financial records. Keep the password safe: a forgotten password cannot be recovered.</ThemedText>
    {open ? <>
      <ThemedText type="small">Use a strong passphrase of 12 to 128 characters. The password is not saved.</ThemedText>
      <TextInput selectionColor={Colors.light.accent} cursorColor={Colors.light.accent} selectionHandleColor={Colors.light.accent} underlineColorAndroid="transparent" accessibilityLabel="Backup password" placeholder="Backup password" placeholderTextColor={theme.textSecondary}
        value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}
        textContentType="newPassword" editable={!locked} maxLength={128} style={inputStyle} />
      <TextInput selectionColor={Colors.light.accent} cursorColor={Colors.light.accent} selectionHandleColor={Colors.light.accent} underlineColorAndroid="transparent" accessibilityLabel="Confirm backup password" placeholder="Confirm password" placeholderTextColor={theme.textSecondary}
        value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false}
        textContentType="newPassword" editable={!locked} maxLength={128} style={inputStyle} />
      <ActionButton label={exporting ? 'Preparing backup...' : 'Encrypt and share backup'} disabled={locked} onPress={() => { void exportFile(); }} />
      <ActionButton label="Cancel" disabled={locked} onPress={() => {
        setPassword(''); setConfirmation(''); setMessage(''); setOpen(false);
      }} />
    </> : <ActionButton label="Export backup" disabled={locked} onPress={() => { setOpen(true); setMessage(''); }} />}
    {message ? <ThemedText accessibilityLiveRegion="polite">{message}</ThemedText> : null}
  </>;
}
