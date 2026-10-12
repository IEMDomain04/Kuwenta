export const notificationsAvailable = false;
import type { Budget, Transaction } from './types';
export type NotificationSettings = { enabled: boolean; daily: boolean; budgets: boolean };
export function getNotificationSettings(): NotificationSettings { return { enabled: false, daily: true, budgets: true }; }
export async function saveNotificationSettings(_settings: NotificationSettings) { throw new Error('Notifications are available in the Android or iOS app.'); }
export async function syncNotifications(_budgets: readonly Budget[], _transactions: readonly Transaction[], _baseline = false) {}
export function observeNotificationTaps(_onTap: (screen: 'home' | 'budgets') => void) { return () => {}; }
