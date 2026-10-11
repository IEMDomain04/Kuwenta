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

export type NotificationSettings = { enabled: boolean; daily: boolean; budgets: boolean; start: number };
const key = 'kuwenta.notifications';
const defaults: NotificationSettings = { enabled: false, daily: true, budgets: true, start: 19 };
let queue: Promise<unknown> = Promise.resolve();
Notifications?.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
export function getNotificationSettings(): NotificationSettings {
  try {
    if (!Notifications) return { ...defaults };
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return { enabled: saved.enabled === true, daily: saved.daily !== false, budgets: saved.budgets !== false, start: [12, 17, 19].includes(saved.start) ? saved.start : 19 };
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
    if (!settings.enabled || !settings.daily || previous.start !== settings.start) {
      for (const item of scheduled) if (item.identifier.startsWith('kuwenta-reminder-') || !settings.enabled && item.identifier.startsWith('kuwenta-budget-')) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
    if ((!previous.enabled && settings.enabled) || (!previous.budgets && settings.budgets)) localStorage.setItem(key + '.baseline', '1');
    localStorage.setItem(key, JSON.stringify(settings));
  });
}
export function syncNotifications(budgets: readonly Budget[], transactions: readonly Transaction[], baseline = false) {
  if (!Notifications) return Promise.resolve();
  return serialize(async () => {
    const settings = getNotificationSettings();
    const allowed = settings.enabled && await permitted();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    let seed = localStorage.getItem(key + '.seed');
    if (!seed) { seed = String(Math.random()); localStorage.setItem(key + '.seed', seed); }
    const random = (day: string) => {
      let hash = 2166136261;
      for (const char of day + seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      return (hash >>> 0) / 4294967296;
    };
    const plan = allowed && settings.daily ? reminderPlan(new Date(), settings.start, settings.start + 2, transactions, random) : [];
    const wanted = new Set(plan.map(item => 'kuwenta-reminder-' + item.day));
    for (const item of scheduled) if (item.identifier.startsWith('kuwenta-reminder-') && !wanted.has(item.identifier)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    const existing = new Set(scheduled.map(item => item.identifier));
    for (const item of plan) {
      const identifier = 'kuwenta-reminder-' + item.day;
      if (!existing.has(identifier)) await Notifications.scheduleNotificationAsync({ identifier,
        content: { title: 'A quick money check-in', body: 'Have you recorded your spending today? Open Kuwenta to keep your records up to date.', sound: false, data: { screen: 'home' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.date, channelId: 'kuwenta' },
      });
    }
    const month = philippineDateTime().transactionDate.slice(0, 7);
    const alerts = budgetAlertPlan(budgets, transactions, month);
    let seen: Record<string, number> = {};
    try { seen = JSON.parse(localStorage.getItem(key + '.seen') || '{}'); } catch { /* Start a fresh ledger. */ }
    if (baseline) seen = {};
    const initialize = baseline || localStorage.getItem(key + '.seen') === null || localStorage.getItem(key + '.baseline') === '1';
    // Keep this month's ledger only; enabling alerts does not replay past spending.
    seen = Object.fromEntries(Object.entries(seen).filter(([entry]) => entry.startsWith(month + ':')));
    for (const alert of alerts) {
      if (allowed && settings.budgets && !initialize && alert.level > (seen[alert.key] || 0)) {
        await Notifications.scheduleNotificationAsync({ identifier: 'kuwenta-budget-' + alert.key + ':' + alert.level, content: { title: alert.title, body: alert.body, sound: false, data: { screen: 'budgets' } }, trigger: { channelId: 'kuwenta' } });
      }
      seen[alert.key] = Math.max(seen[alert.key] || 0, alert.level);
      // Persist each successful alert before processing the next budget.
      localStorage.setItem(key + '.seen', JSON.stringify(seen));
    }
    localStorage.setItem(key + '.seen', JSON.stringify(seen));
    localStorage.removeItem(key + '.baseline');
  });
}

export function observeNotificationTaps(onTap: (screen: 'home' | 'budgets') => void) {
  if (!Notifications) return () => {};
  function handle(response: NotificationResponse | null) {
    const screen = response?.notification.request.content.data?.screen;
    if (screen === 'home' || screen === 'budgets') { onTap(screen); void Notifications?.clearLastNotificationResponseAsync(); }
  }
  handle(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
