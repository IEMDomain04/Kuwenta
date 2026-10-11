import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { parseQuickEntry } from '../quick-entry';
import type { TransactionDraft } from '../types';
import { ActionButton } from './ui';

export function QuickEntry({ disabled, accountId, onReview, onCancel }: { disabled: boolean; accountId?: string; onReview: (draft: TransactionDraft, warnings: string[]) => void; onCancel: () => void }) {
  const theme = useTheme();
  const { accounts, lastEntryAccount } = useFinance();
  const [selectedAccount, setSelectedAccount] = useState(accountId ?? (accounts.some((row) => row.id === lastEntryAccount && !row.archived) ? lastEntryAccount : accounts.find((row) => !row.archived)?.id));
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  function review() {
    if (disabled) return;
    try { const result = parseQuickEntry(text, accounts, new Date(), selectedAccount, lastEntryAccount); Keyboard.dismiss(); onReview(result.draft, result.warnings); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not understand the phrase.'); }
  }
  return <View style={{ gap: 12, padding: 14, backgroundColor: theme.backgroundElement, borderRadius: 16 }}>
    <ThemedText type="smallBold">Quick Entry - offline</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">One income or expense. Try Lunch 120, Pamasahe 30 kahapon, or Salary 25,000. Put an account last: Groceries 1,500 from Cash.</ThemedText>
    <ThemedText type="small">Account (an explicit account in the phrase takes priority)</ThemedText>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {accounts.filter((row) => !row.archived).map((account) => <Pressable key={account.id} accessibilityRole="button" accessibilityState={{ selected: selectedAccount === account.id, disabled }} disabled={disabled} onPress={() => setSelectedAccount(account.id)} style={{ minHeight: 44, maxWidth: 160, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: selectedAccount === account.id ? theme.backgroundSelected : theme.background }}>
        <ThemedText type="small" numberOfLines={1}>{account.name}</ThemedText>
      </Pressable>)}
    </ScrollView>
    <TextInput autoFocus accessibilityLabel="Quick transaction phrase" value={text} maxLength={250} onChangeText={(value) => { setText(value); setError(''); }} editable={!disabled} placeholder="Lunch 120" placeholderTextColor={theme.textSecondary} returnKeyType="done" onSubmitEditing={review}
      style={{ padding: 14, color: theme.text, fontSize: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }} />
    {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
    <ActionButton primary label="Review transaction" disabled={disabled || !text.trim()} onPress={review} />
    <ActionButton label="Use regular form" disabled={disabled} onPress={onCancel} />
    <ThemedText type="small" themeColor="textSecondary">Uses local text rules, not a chat model. Nothing is saved until you review the form and press Save.</ThemedText>
  </View>;
}
