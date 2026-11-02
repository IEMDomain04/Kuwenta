import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFinance } from '../../provider';
import { trackerSetupFinished, type TrackerSetup, type TrackerSetupStep } from '../../storage/tracker-setup';
import { ActionButton } from '../shared/ui';

export function TrackerSetupChecklist({ forceVisible = false, onClose }: { forceVisible?: boolean; onClose?: () => void }) {
  const { trackerSetup: state, busy, saveTrackerSetup } = useFinance();
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { if (forceVisible) setExpanded(true); }, [forceVisible]);
  const pending = useRef(false);
  if (!state || (!forceVisible && (state.dismissed || trackerSetupFinished(state)))) return null;

  const steps = [
    { id: 'accounts', label: 'Set up your accounts', detail: 'Review your accounts and balances. Add banks or e-wallets if needed.', optional: false },
    { id: 'visuals', label: 'Choose your Home visuals', detail: 'Choose charts and summaries in Settings, or keep the current selection.', optional: false },
    { id: 'transaction', label: 'Record your first transaction', detail: 'Add an expense or income to start seeing your activity.', optional: false },
    { id: 'budget', label: 'Create a budget', detail: 'Set an overall or category spending limit when you are ready.', optional: true },
    { id: 'goal', label: 'Add a savings goal', detail: 'Choose something you would like to save toward.', optional: true },
  ] as const;
  const complete = (id: TrackerSetupStep) => state.completed.includes(id);
  const skipped = (id: TrackerSetupStep) => state.skipped.some(value => value === id);
  const next = steps.find(step => !complete(step.id) && !skipped(step.id));
  const count = steps.filter(step => complete(step.id) || skipped(step.id)).length;
  const open = expanded;

  function go(id: TrackerSetupStep) {
    onClose?.();
    if (id === 'accounts') router.push('/accounts');
    else if (id === 'visuals') router.push({ pathname: '/settings', params: { section: 'visuals' } });
    else if (id === 'transaction') router.push('/transaction');
    else if (id === 'budget') router.push({ pathname: '/budgets', params: { add: '1' } });
    else router.push('/goal');
  }
  async function persist(value: TrackerSetup, closing = false) {
    if (busy || pending.current) return;
    pending.current = true;
    try { await saveTrackerSetup(value); if (closing) onClose?.(); }
    catch { /* The provider keeps the checklist and shows the save failure. */ }
    finally { pending.current = false; }
  }
  return <View style={{ padding: 14, borderRadius: 20, gap: 8, backgroundColor: theme.backgroundElement }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Set up your tracker" accessibilityState={{ expanded: open }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText type="smallBold">Set up your tracker</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{count} of {steps.length} steps finished</ThemedText>
      </View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.accent} />
    </Pressable>
    {open ? steps.map(step => <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={step.label + (complete(step.id) ? ', completed' : skipped(step.id) ? ', skipped' : '')} disabled={busy} onPress={() => go(step.id)} style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={complete(step.id) ? 'checkmark-circle' : skipped(step.id) ? 'remove-circle-outline' : 'ellipse-outline'} size={20} color={complete(step.id) ? theme.accent : theme.textSecondary} />
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText type="smallBold">{step.label}{step.optional ? ' (optional)' : ''}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{complete(step.id) ? 'Done' : skipped(step.id) ? 'Skipped for now' : step.detail}</ThemedText>
        </View>
      </Pressable>
      {step.optional && !complete(step.id) && !skipped(step.id) ? <Pressable accessibilityRole="button" accessibilityLabel={'Skip ' + step.label.toLowerCase()} disabled={busy} onPress={() => { void persist({ ...state, skipped: [...state.skipped, step.id] }); }} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}>
        <ThemedText type="small" themeColor="accent">Skip</ThemedText>
      </Pressable> : null}
    </View>) : next ? <ThemedText type="small" themeColor="textSecondary">{next.detail}</ThemedText> : null}
    {next ? <ActionButton compact primary label={next.label} disabled={busy} onPress={() => go(next.id)} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={forceVisible ? 'Close checklist' : 'Hide checklist'} disabled={busy} onPress={() => { void persist({ ...state, dismissed: true }, true); }} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <ThemedText type="small" themeColor="textSecondary">{forceVisible ? 'Close checklist' : 'Hide checklist'}</ThemedText>
    </Pressable>
  </View>;
}
