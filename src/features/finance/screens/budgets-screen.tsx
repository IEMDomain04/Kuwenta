import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { SelectionSheet } from '../components/selection-sheet';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { CATEGORIES, type Budget } from '../types';
import { budgetReport, validateBudget } from '../budgets';
import { formatMoney, moneyInput, parseMoney } from '../money';
import { formatEditableMoney } from '../inputs';
import { readableReportingMonth } from '../dates';
import { MoneyField } from '../components/money-field';
import { HomeMonthPicker } from '../components/home-month-picker';
import { ActionButton, IconButton, FinanceScreen, BackButton } from '../components/ui';

export default function BudgetsScreen() {
  const params = useLocalSearchParams<{ add?: string; category?: string }>();
  const finance = useFinance();
  const theme = useTheme();
  const { month, budgets, transactions, busy } = finance;
  const report = budgetReport(budgets, transactions, month);
  const [editor, setEditor] = useState<{ category: string; amount: string; creating: boolean } | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  function setError(message: string) { if (message) finance.showNotice(message, true); }
  const [rejected, setRejected] = useState(false);
  const [working, setWorking] = useState(false);
  const amountInput = useRef<TextInput>(null);
  const pending = useRef(false);
  const locked = busy || working;
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => pending.current || locked); return () => listener.remove(); }, [locked]);
  useEffect(() => {
    const existing = report.rows.find((row) => row.category === params.category);
    const unusedCategory = CATEGORIES.EXPENSE.find((category) => !report.rows.some((row) => row.category === category));
    setEditor(existing ? { category: existing.category, amount: formatEditableMoney(moneyInput(existing.limitAmount))!, creating: false } : params.add === '1' && unusedCategory ? { category: unusedCategory, amount: '', creating: true } : null);
    setCategoryOpen(false); setError(''); setRejected(false);
    // Route intent initializes the editor; saving does not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, params.add, params.category]);
  async function perform(operation: () => Promise<void>) {
    setWorking(true); setError('');
    try { await operation(); setEditor(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update budgets.'); }
    finally { pending.current = false; setWorking(false); }
  }
  function confirm(title: string, message: string, operation: () => Promise<void>, destructive = false) {
    if (locked || pending.current) return;
    pending.current = true; Keyboard.dismiss();
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => { pending.current = false; } },
      { text: destructive ? 'Delete' : 'Confirm', style: destructive ? 'destructive' : 'default', onPress: () => { void perform(operation); } },
    ], { cancelable: false });
  }
  function save() {
    if (!editor || locked || pending.current || rejected) return;
    let budget: Budget;
    try {
      budget = { month, category: editor.category, limitAmount: parseMoney(editor.amount.replace(/,/g, '')) };
      validateBudget(budget);
      budgetReport([...budgets.filter((row) => row.month !== month || row.category !== budget.category), budget], transactions, month);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid budget.'); amountInput.current?.focus(); return; }
    const creating = editor.creating;
    if (creating) { pending.current = true; void perform(() => finance.saveBudget(budget, true)); }
    else confirm('Save budget changes?', budget.category + ' for ' + readableReportingMonth(month) + ': ' + formatMoney(budget.limitAmount) + '. Transactions remain unchanged.', () => finance.saveBudget(budget, false));
  }
  const unused = CATEGORIES.EXPENSE.filter((category) => !report.rows.some((row) => row.category === category));
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <FinanceScreen title="Budgets" tabScreen={false} headerLeading={<BackButton disabled={locked} />} headerAccessory={<HomeMonthPicker />}>
      <ThemedText type="small" themeColor="textSecondary">Monthly limits across all accounts. Budgets do not move money.</ThemedText>
      <ThemedText type="smallBold">Budgeted categories: {formatMoney(report.budgetedSpent)} spent of {formatMoney(report.totalLimit)}</ThemedText>
      {!editor ? <>
      {report.rows.map((row) => <View key={row.category} style={{ padding: 14, borderRadius: 16, backgroundColor: theme.backgroundElement, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="pie-chart-outline" size={18} color={theme.secondary} /><ThemedText type="smallBold">{row.category}</ThemedText></View>
        <ThemedText type="small">Spent {formatMoney(row.spent)} / Limit {formatMoney(row.limitAmount)}</ThemedText>
        <ThemedText type="small" style={{ color: row.remaining < 0 ? theme.expense : theme.textSecondary }}>{row.status} - {row.remaining < 0 ? 'Over by ' + formatMoney(-row.remaining) : 'Remaining ' + formatMoney(row.remaining)}</ThemedText>
        <View accessibilityRole="progressbar" accessibilityLabel={row.category + ' budget usage'} accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(row.progress * 100)), text: Math.round(row.progress * 100) + '% used, ' + row.status }} style={{ height: 6, borderRadius: 3, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
          <View style={{ height: 6, width: (Math.min(1, row.progress) * 100 + '%') as `${number}%`, backgroundColor: row.remaining < 0 ? theme.expense : theme.secondary }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View><IconButton icon="pencil-outline" label={'Edit ' + row.category + ' budget'} disabled={locked} onPress={() => { setEditor({ category: row.category, amount: formatEditableMoney(moneyInput(row.limitAmount))!, creating: false }); setError(''); setRejected(false); }} /></View>
          <View><IconButton icon="trash-outline" destructive label={'Delete ' + row.category + ' budget'} disabled={locked} onPress={() => confirm('Delete budget?', 'Remove ' + row.category + ' budget for ' + readableReportingMonth(month) + '? Your expenses are kept.', () => finance.removeBudget(month, row.category), true)} /></View>
        </View>
      </View>)}
      {report.rows.length > 0 ? <ThemedText type="small" style={{ color: report.remaining < 0 ? theme.expense : theme.secondary }}>{formatMoney(Math.abs(report.remaining))} {report.remaining < 0 ? 'over budget' : 'remaining'}</ThemedText> : null}
      {report.rows.length === 0 && <ThemedText>No budgets for this month. Add a category limit to start tracking.</ThemedText>}
      {!editor && <ActionButton primary label="Add budget" disabled={locked || unused.length === 0} onPress={() => { setEditor({ category: unused[0], amount: '', creating: true }); setRejected(false); setError(''); }} />}
      </> : null}
      {editor && <View style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: theme.backgroundElement }}>
        <ThemedText type="smallBold">{editor.creating ? 'Add budget' : 'Edit budget'} - {readableReportingMonth(month)}</ThemedText>
        <ThemedText type="small">Category</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Budget category" disabled={locked || !editor.creating} onPress={() => { Keyboard.dismiss(); setCategoryOpen(true); }} style={{ minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{editor.category}</ThemedText>
          {editor.creating ? <Ionicons name="chevron-down" size={16} color={theme.textSecondary} /> : null}
        </Pressable>
        <ThemedText type="small">Monthly limit (PHP)</ThemedText>
        <MoneyField ref={amountInput} accessibilityLabel="Monthly budget limit in pesos" autoFocus value={editor.amount} editable={!locked} placeholder="0" placeholderTextColor={theme.textSecondary}
          onValueChange={(amount) => { setEditor({ ...editor, amount }); setRejected(false); setError(''); }} onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }}
          style={{ color: theme.text, fontSize: 22, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }} />
        <ActionButton primary label={working ? 'Saving...' : 'Save'} disabled={locked || rejected} onPress={save} />
        <ActionButton label="Cancel" disabled={locked} onPress={() => { if (!pending.current) { setEditor(null); setError(''); } }} />
      </View>}
      <SelectionSheet visible={categoryOpen && Boolean(editor)} title="Budget category" options={unused.map((category) => ({ value: category, label: category }))} selected={editor?.category} disabled={locked} onClose={() => setCategoryOpen(false)} onSelect={(category) => setEditor((current) => current ? { ...current, category } : null)} />

      {!editor ? <>
      <ThemedText type="smallBold">Expenses without budgets</ThemedText>
      {report.unbudgeted.length ? report.unbudgeted.map((row) => <ThemedText key={row.category} type="small">{row.category}: {formatMoney(row.amount)}</ThemedText>) : <ThemedText type="small">No expenses outside budgeted categories this month.</ThemedText>}
      </> : null}
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
