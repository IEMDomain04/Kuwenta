import type { FinanceDatabase } from './database';

export const TRACKER_SETUP_STEPS = ['accounts', 'visuals', 'transaction', 'budget', 'goal'] as const;
export type TrackerSetupStep = typeof TRACKER_SETUP_STEPS[number];
export type TrackerSetup = {
  completed: TrackerSetupStep[];
  skipped: ('budget' | 'goal')[];
  dismissed: boolean;
};

export function initialTrackerSetup(balanceProvided = false): TrackerSetup {
  return { completed: balanceProvided ? ['accounts'] : [], skipped: [], dismissed: false };
}

function validate(value: unknown): TrackerSetup {
  const state = value as TrackerSetup | null;
  if (!state || typeof state.dismissed !== 'boolean' || !Array.isArray(state.completed) || !Array.isArray(state.skipped)
    || state.completed.some(step => !TRACKER_SETUP_STEPS.includes(step))
    || state.skipped.some(step => step !== 'budget' && step !== 'goal')) {
    throw new Error('Invalid tracker setup progress.');
  }
  return {
    completed: TRACKER_SETUP_STEPS.filter(step => state.completed.includes(step)),
    skipped: (['budget', 'goal'] as const).filter(step => state.skipped.includes(step) && !state.completed.includes(step)),
    dismissed: state.dismissed,
  };
}

export function trackerSetupFinished(state: TrackerSetup): boolean {
  return TRACKER_SETUP_STEPS.every(step => state.completed.includes(step) || state.skipped.some(skipped => skipped === step));
}

export async function saveTrackerSetup(db: FinanceDatabase, state: TrackerSetup): Promise<void> {
  await db.runAsync("INSERT INTO preferences(key, value) VALUES ('trackerSetup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(validate(state)));
}

export async function loadTrackerSetup(db: FinanceDatabase, achieved: readonly TrackerSetupStep[] = [], initialize = false): Promise<TrackerSetup | null> {
  const saved = await db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key = 'trackerSetup'");
  if (!saved) {
    if (!initialize) return null;
    const initial = initialTrackerSetup();
    await saveTrackerSetup(db, initial);
    return initial;
  }
  let state: TrackerSetup;
  try { state = validate(JSON.parse(saved.value)); } catch { return null; }
  const next = validate({ ...state, completed: [...state.completed, ...achieved] });
  if (JSON.stringify(next) !== JSON.stringify(state)) {
    try { await saveTrackerSetup(db, next); }
    catch (cause) { console.warn('Could not save tracker setup progress:', cause); }
  }
  return next;
}
