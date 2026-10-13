import { budgetPeriodKey, isBudgetPeriodKey } from './budget-periods';
import 'expo-sqlite/localStorage/install';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { NotificationResponse } from 'expo-notifications';

import { Platform } from 'react-native';
import { budgetAlertPlan, reminderPlan } from './notification-plan';
import { philippineDateTime } from './dates';
import type { Budget, Transaction } from './types';

// The package entry point registers push tokens even when only local reminders are used.
export const notificationsAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
const Notifications: typeof import('expo-notifications') | null = notificationsAvailable ? require('expo-notifications') : null;

export type NotificationSettings = { enabled: boolean; daily: boolean; budgets: boolean };
const key = 'kuwenta.notifications';
const defaults: NotificationSettings = { enabled: false, daily: true, budgets: true };
let queue: Promise<unknown> = Promise.resolve();
Notifications?.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
export function getNotificationSettings(): NotificationSettings {
  try {
    if (!Notifications) return { ...defaults };
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return { enabled: saved.enabled === true, daily: saved.daily !== false, budgets: saved.budgets !== false };
  } catch { return { ...defaults }; }
}
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.catch(() => {});
  return next;
}
async function channel() {
  if (Notifications && Platform.OS === 'android') await Notifications.setNotificationChannelAsync('kuwenta', { name: 'Kuwenta reminders', importance: Notifications.AndroidImportance.DEFAULT, sound: null });
}
async function permitted() {
  if (!Notifications) return false;
  const result = await Notifications.getPermissionsAsync();
  return result.granted || result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}
export async function saveNotificationSettings(settings: NotificationSettings) {
  if (!Notifications) throw new Error('Test notifications in the installed Kuwenta app or a development build, rather than Expo Go.');
  if (settings.enabled) {
    await channel();
    if (!await permitted()) {
      const result = await Notifications.requestPermissionsAsync();
      if (!result.granted && result.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) throw new Error('Notifications are not allowed. You can enable them in your phone settings.');
    }
  }
  await serialize(async () => {
    const previous = getNotificationSettings();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!settings.enabled || !settings.daily) {
      for (const item of scheduled) if (item.identifier.startsWith('kuwenta-reminder-') || !settings.enabled && item.identifier.startsWith('kuwenta-budget-')) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
    if ((!previous.enabled && settings.enabled) || (!previous.budgets && settings.budgets)) localStorage.setItem(key + '.baseline', '1');
    localStorage.setItem(key, JSON.stringify({ enabled: settings.enabled, daily: settings.daily, budgets: settings.budgets }));
  });
}
export function syncNotifications(budgets: readonly Budget[], transactions: readonly Transaction[], baseline = false) {
  if (!Notifications) return Promise.resolve();
  return serialize(async () => {
    const settings = getNotificationSettings();
    const allowed = settings.enabled && await permitted();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const plan = allowed && settings.daily ? reminderPlan(new Date(), transactions) : [];
    const wanted = new Set(plan.map(item => 'kuwenta-reminder-' + item.key));
    for (const item of scheduled) if (item.identifier.startsWith('kuwenta-reminder-') && !wanted.has(item.identifier)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    const existing = new Map(scheduled.map(item => [item.identifier, item]));
    for (const item of plan) {
      const identifier = 'kuwenta-reminder-' + item.key;
      const previous = existing.get(identifier);
      if (previous?.content.title === item.title && previous.content.body === item.body) continue;
      // Refresh old wording after an app update, without rescheduling unchanged reminders.
      if (previous) await Notifications.cancelScheduledNotificationAsync(identifier);
      await Notifications.scheduleNotificationAsync({ identifier,
        content: { title: item.title, body: item.body, sound: false, data: { screen: 'home' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: 'kuwenta' },
      });
    }
    const date = philippineDateTime().transactionDate;
    const month = date.slice(0, 7);
    const alerts = budgetAlertPlan(budgets, transactions, month, date);
    let seen: Record<string, number> = {};
    try { seen = JSON.parse(localStorage.getItem(key + '.seen') || '{}'); } catch { /* Start a fresh ledger. */ }
    if (baseline) seen = {};
    const initialize = baseline || localStorage.getItem(key + '.seen') === null || localStorage.getItem(key + '.baseline') === '1';
    // Keep all active-period entries, including temporarily lowered budgets, to avoid repeat alerts.
    const activeKeys = [month, budgetPeriodKey('daily', date), budgetPeriodKey('weekly', date)];
    seen = Object.fromEntries(Object.entries(seen).filter(([entry]) => activeKeys.some(scope => entry.startsWith(scope + ':'))));
    for (const alert of alerts) {
      if (allowed && settings.budgets && !initialize && alert.level > (seen[alert.key] || 0)) {
        await Notifications.scheduleNotificationAsync({ identifier: 'kuwenta-budget-' + alert.key + ':' + alert.level, content: { title: alert.title, body: alert.body, sound: false, data: { screen: 'budgets', scope: alert.scope } }, trigger: { channelId: 'kuwenta' } });
      }
      seen[alert.key] = Math.max(seen[alert.key] || 0, alert.level);
      // Persist each successful alert before processing the next budget.
      localStorage.setItem(key + '.seen', JSON.stringify(seen));
    }
    localStorage.setItem(key + '.seen', JSON.stringify(seen));
    localStorage.removeItem(key + '.baseline');
  });
}

export function observeNotificationTaps(onTap: (screen: 'home' | 'budgets', scope?: string) => void) {
  if (!Notifications) return () => {};
  function handle(response: NotificationResponse | null) {
    const screen = response?.notification.request.content.data?.screen;
    if (screen === 'home' || screen === 'budgets') { const scope = response?.notification.request.content.data?.scope; onTap(screen, typeof scope === 'string' && isBudgetPeriodKey(scope) ? scope : undefined); void Notifications?.clearLastNotificationResponseAsync(); }
  }
  handle(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
