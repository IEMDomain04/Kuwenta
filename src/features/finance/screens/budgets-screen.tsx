import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useFinance } from '../provider';
import { CATEGORIES, type Budget } from '../types';
import { budgetReport, validateBudget } from '../budgets';
import { adjacentMonth } from '../reporting';
import { formatMoney, moneyInput, parseMoney } from '../money';
import { formatEditableMoney } from '../inputs';
import { readableReportingMonth } from '../dates';
import { MoneyField } from '../components/money-field';
import { HomeMonthPicker } from '../components/home-month-picker';
import { ActionButton, FinanceScreen, BackButton } from '../components/ui';

export default function BudgetsScreen() {
  const finance = useFinance();
  const theme = useTheme();
  const { month, budgets, transactions, busy } = finance;
  const report = budgetReport(budgets, transactions, month);
  const [editor, setEditor] = useState<{ category: string; amount: string; creating: boolean } | null>(null);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState(false);
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const locked = busy || working;
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => pending.current || locked); return () => listener.remove(); }, [locked]);
  useEffect(() => { setEditor(null); setError(''); setRejected(false); }, [month]);
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid budget.'); return; }
    const creating = editor.creating;
    if (creating) { pending.current = true; void perform(() => finance.saveBudget(budget, true)); }
    else confirm('Save budget changes?', budget.category + ' for ' + readableReportingMonth(month) + ': ' + formatMoney(budget.limitAmount) + '. Transactions remain unchanged.', () => finance.saveBudget(budget, false));
  }
  function copy() {
    if (locked || pending.current) return;
    try {
      const previous = adjacentMonth(month, -1);
      const missing = budgets.filter((row) => row.month === previous && !report.rows.some((current) => current.category === row.category));
      if (!missing.length) { setError('No missing category budgets to copy from the previous month.'); return; }
      confirm('Copy previous month?', 'Copy ' + missing.length + ' missing category budgets from ' + readableReportingMonth(previous) + '. Existing limits are kept.', () => finance.copyBudgets(month));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not copy budgets.'); }
  }
  const unused = CATEGORIES.EXPENSE.filter((category) => !report.rows.some((row) => row.category === category));
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FinanceScreen title="Budgets" tabScreen={false} headerLeading={<BackButton disabled={locked} />} headerAccessory={<HomeMonthPicker />}>
      <ThemedText type="small" themeColor="textSecondary">Monthly limits across all accounts. Budgets do not move money.</ThemedText>
      <ThemedText type="smallBold">Budgeted categories: {formatMoney(report.budgetedSpent)} spent of {formatMoney(report.totalLimit)}</ThemedText>
      {report.rows.map((row) => <View key={row.category} style={{ padding: 14, borderRadius: 16, backgroundColor: theme.backgroundElement, gap: 8 }}>
        <ThemedText type="smallBold">{row.category}</ThemedText>
        <ThemedText type="small">Spent {formatMoney(row.spent)} / Limit {formatMoney(row.limitAmount)}</ThemedText>
        <ThemedText type="small" style={{ color: row.remaining < 0 ? theme.expense : theme.textSecondary }}>{row.status} - {row.remaining < 0 ? 'Over by ' + formatMoney(-row.remaining) : 'Remaining ' + formatMoney(row.remaining)}</ThemedText>
        <View accessibilityRole="progressbar" accessibilityLabel={row.category + ' budget usage'} accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(row.progress * 100)), text: Math.round(row.progress * 100) + '% used, ' + row.status }} style={{ height: 6, borderRadius: 3, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
          <View style={{ height: 6, width: (Math.min(1, row.progress) * 100 + '%') as `${number}%`, backgroundColor: row.remaining < 0 ? theme.expense : theme.accent }} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <ActionButton compact label="Edit" disabled={locked} onPress={() => { setEditor({ category: row.category, amount: formatEditableMoney(moneyInput(row.limitAmount))!, creating: false }); setError(''); setRejected(false); }} />
          <ActionButton compact label="Delete" disabled={locked} onPress={() => confirm('Delete budget?', 'Remove ' + row.category + ' budget for ' + readableReportingMonth(month) + '? Your expenses are kept.', () => finance.removeBudget(month, row.category), true)} />
        </View>
      </View>)}
      {report.rows.length > 0 ? <ThemedText type="small" style={{ color: report.remaining < 0 ? theme.expense : theme.income }}>{formatMoney(Math.abs(report.remaining))} {report.remaining < 0 ? 'over budget' : 'remaining'}</ThemedText> : null}
      {report.rows.length === 0 && <ThemedText>No budgets for this month. Add a category limit to start tracking.</ThemedText>}
      {!editor && <ActionButton primary label="Add category budget" disabled={locked || unused.length === 0} onPress={() => { setEditor({ category: unused[0], amount: '', creating: true }); setRejected(false); setError(''); }} />}
      {editor && <View style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: theme.backgroundElement }}>
        <ThemedText type="smallBold">{editor.creating ? 'Add budget' : 'Edit budget'} - {readableReportingMonth(month)}</ThemedText>
        {editor.creating ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{unused.map((category) => <ActionButton key={category} compact label={category} selected={editor.category === category} disabled={locked} onPress={() => setEditor({ ...editor, category })} />)}</View> : <ThemedText>{editor.category}</ThemedText>}
        <MoneyField accessibilityLabel="Monthly budget limit in pesos" autoFocus value={editor.amount} editable={!locked} placeholder="0" placeholderTextColor={theme.textSecondary}
          onValueChange={(amount) => { setEditor({ ...editor, amount }); setRejected(false); setError(''); }} onRejected={() => { setRejected(true); setError('Use digits and up to two decimal places.'); }}
          style={{ color: theme.text, fontSize: 22, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12 }} />
        <ActionButton primary label={working ? 'Saving...' : editor.creating ? 'Save budget' : 'Review changes'} disabled={locked || rejected} onPress={save} />
        <ActionButton label="Cancel" disabled={locked} onPress={() => { if (!pending.current) { setEditor(null); setError(''); } }} />
      </View>}
      <ActionButton label="Copy previous month" disabled={locked} onPress={copy} />
      {error ? <ThemedText accessibilityRole="alert">{error}</ThemedText> : null}
      <ThemedText type="smallBold">Expenses without budgets</ThemedText>
      {report.unbudgeted.length ? report.unbudgeted.map((row) => <ThemedText key={row.category} type="small">{row.category}: {formatMoney(row.amount)}</ThemedText>) : <ThemedText type="small">No expenses outside budgeted categories this month.</ThemedText>}
    </FinanceScreen>
  </KeyboardAvoidingView>;
}
