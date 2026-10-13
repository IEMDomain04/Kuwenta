import { AccountIcon } from './account-icon';
import { FieldError } from './field-error';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { parseQuickEntry } from '../quick-entry';
import type { TransactionDraft } from '../types';
import { ActionButton } from './ui';

export function QuickEntry({ disabled, accountId, onReview, onCancel }: { disabled: boolean; accountId?: string; onReview: (draft: TransactionDraft, warnings: string[]) => void; onCancel: () => void }) {
  const theme = useTheme();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { accounts, lastEntryAccount, showNotice } = useFinance();
  const [selectedAccount, setSelectedAccount] = useState(accountId ?? (accounts.some((row) => row.id === lastEntryAccount && !row.archived) ? lastEntryAccount : accounts.find((row) => !row.archived)?.id));
  const input = useRef<TextInput>(null);
  const [text, setText] = useState('');
  function setError(message: string) { setFieldErrors(message ? { phrase: message } : {}); if (message) showNotice(message, true); }
  function review() {
    if (disabled) return;
    try { const result = parseQuickEntry(text, accounts, new Date(), selectedAccount, lastEntryAccount); Keyboard.dismiss(); onReview(result.draft, result.warnings); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not understand the phrase.'); input.current?.focus(); }
  }
  return <View style={{ gap: 12, padding: 14, backgroundColor: theme.backgroundElement, borderRadius: 16 }}>
    <ThemedText type="smallBold">Quick Entry</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">Try: Mobile load 100 from Cash</ThemedText>
    <ThemedText type="small">Account</ThemedText>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {accounts.filter((row) => !row.archived).map((account) => <Pressable key={account.id} accessibilityRole="button" accessibilityState={{ selected: selectedAccount === account.id, disabled }} disabled={disabled} onPress={() => setSelectedAccount(account.id)} style={{ minHeight: 44, maxWidth: 160, paddingHorizontal: 12, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, backgroundColor: selectedAccount === account.id ? theme.backgroundSelected : theme.background }}>
        <AccountIcon account={account} size={20} color={theme.accent} />
        <ThemedText type="small" numberOfLines={1} style={{ flexShrink: 1 }}>{account.name}</ThemedText>
      </Pressable>)}
    </ScrollView>
    <View style={{ borderWidth: 1, borderColor: fieldErrors.phrase ? theme.error : theme.border, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.backgroundElement }}>
    <TextInput ref={input} selectionColor={theme.accent} cursorColor={theme.accent} selectionHandleColor={theme.accent} underlineColorAndroid="transparent" autoFocus accessibilityLabel="Quick transaction phrase" value={text} maxLength={250} onChangeText={(value) => { setText(value); setError(''); }} editable={!disabled} placeholder="Type a transaction" placeholderTextColor={theme.textSecondary} returnKeyType="done" onSubmitEditing={review}
      style={{ padding: 14, minHeight: 48, color: theme.text, fontSize: 12, borderWidth: 0, backgroundColor: 'transparent' }} />
    </View>

    <FieldError message={fieldErrors.phrase} />
    <ActionButton primary label="Review" disabled={disabled || !text.trim()} onPress={review} />
    <ActionButton label="Use regular form" disabled={disabled} onPress={onCancel} />
  </View>;
}
