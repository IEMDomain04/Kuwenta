const test = require('node:test');
const assert = require('node:assert/strict');
const { reminderPlan, budgetAlertPlan } = require('../../.expo/finance-tests/notification-plan.js');
const { philippineDateTime } = require('../../.expo/finance-tests/dates.js');
const now = new Date('2026-10-12T02:00:00Z');
function expense(amount, overrides = {}) { return { id: 'one', type: 'EXPENSE', amount, category: 'Food', accountId: 'cash', transactionDate: '2026-10-12', transactionTime: '10:00:00', createdAt: now.toISOString(), updatedAt: now.toISOString(), ...overrides }; }
test('reminders use six-hour waking slots, stay bounded and never schedule in the past', () => {
  const plan = reminderPlan(now, []);
  assert.equal(plan.length, 41);
  assert.equal(new Set(plan.map(p => p.key)).size, 41);
  for (const item of plan) {
    const ph = philippineDateTime(item.date);
    assert.equal(ph.transactionDate, item.day);
    assert.ok(['08:00:00', '14:00:00', '20:00:00'].includes(ph.transactionTime));
    assert.ok(item.date > now);
  }
  const full = reminderPlan(new Date('2026-10-11T16:00:00Z'), []);
  assert.equal(full.length, 42);
  assert.equal(full[1].date - full[0].date, 6 * 3600000);
  assert.equal(full[2].date - full[1].date, 6 * 3600000);
  assert.equal(full[3].date - full[2].date, 12 * 3600000);
});

test('recent recording suppresses the next slot even for backdated entries, but not adjustments or future audit times', () => {
  const record = expense(100, { transactionDate: '2026-09-01' });
  assert.equal(reminderPlan(now, [record])[0].key, '2026-10-12-20');
  assert.equal(reminderPlan(now, [expense(100, { type: 'ADJUSTMENT' })])[0].key, '2026-10-12-14');
  assert.equal(reminderPlan(now, [expense(100, { createdAt: '2026-10-12T05:00:00Z' })]).length, 41);
  const sixHoursAgo = expense(100, { createdAt: '2026-10-12T00:00:00Z' });
  assert.equal(reminderPlan(now, [sixHoursAgo])[0].key, '2026-10-12-14');
});

test('slot identities remain stable across refreshes and year boundaries', () => {
  const plan = reminderPlan(new Date('2026-12-31T01:00:00Z'), []);
  const again = reminderPlan(new Date('2026-12-31T02:00:00Z'), []);
  assert.deepEqual(plan, again);
  assert.equal(plan[2].day, '2027-01-01');
});

test('budget alerts use exact 80% and exceeded thresholds and exclude transfers', () => {
  const budgets = [{ month: '2026-10', category: 'Food', limitAmount: 1000 }];
  assert.deepEqual(budgetAlertPlan(budgets, [expense(799)], '2026-10'), []);
  for (const amount of [800,1000]) assert.equal(budgetAlertPlan(budgets, [expense(amount)], '2026-10')[0].level, 1);
  const over = budgetAlertPlan(budgets, [expense(1001)], '2026-10')[0];
  assert.equal(over.level, 2);
  assert.equal(over.key, '2026-10:Food');
  assert.ok(!over.body.includes('Food') && !over.body.includes('1001'));
  assert.deepEqual(budgetAlertPlan(budgets, [expense(5000, { type: 'TRANSFER', destinationAccountId: 'bank' })], '2026-10'), []);
  assert.deepEqual(budgetAlertPlan(budgets, [expense(5000)], '2026-11'), []);
});

function notificationHarness(existingStore = new Map(), expoGo = false) {
  const vm = require('node:vm');
  const ts = require('typescript');
  const fs = require('node:fs');
  const scheduled = new Map();
  const delivered = [];
  const scheduledCalls = [];
  let allowed = true;
  let requests = 0;
  let tapListener;
  const native = {
    setNotificationHandler() {},
    getLastNotificationResponse: () => null,
    clearLastNotificationResponseAsync: async () => {},
    addNotificationResponseReceivedListener: listener => { tapListener = listener; return { remove() { tapListener = undefined; } }; },
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ granted: allowed }),
    requestPermissionsAsync: async () => { requests++; return { granted: allowed }; },
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    cancelScheduledNotificationAsync: async id => { scheduled.delete(id); },
    scheduleNotificationAsync: async item => {
      scheduledCalls.push(item);
      const request = { ...item, identifier: item.identifier || String(delivered.length + scheduled.size), content: item.content };
      if (item.trigger?.type === 'date') scheduled.set(request.identifier, request);
      else delivered.push(request);
      return request.identifier;
    },
    AndroidImportance: { DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
  };
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } static now() { return now.getTime(); } }
  const source = ts.transpileModule(fs.readFileSync('src/features/finance/notifications.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, Date: FixedDate, console, localStorage: {
    getItem: key => existingStore.get(key) ?? null,
    setItem: (key, value) => existingStore.set(key, value), removeItem: key => existingStore.delete(key),
  }, require(name) {
    if (name === 'expo-notifications') { if (expoGo) throw new Error('Push module loaded in Expo Go'); return native; }
    if (name === 'expo-constants') return { __esModule: true, default: { executionEnvironment: expoGo ? 'storeClient' : 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } };
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'expo-sqlite/localStorage/install') return {};
    if (name === './notification-plan') return { reminderPlan, budgetAlertPlan };
    if (name === './budget-periods') return require('../../.expo/finance-tests/budget-periods.js');
    if (name === './dates') return { philippineDateTime };
    throw new Error('Unexpected dependency: ' + name);
  } };
  vm.runInNewContext(source, sandbox);
  return { tap: data => tapListener({ notification: { request: { content: { data } } } }), api: sandbox.exports, store: existingStore, scheduled, delivered, scheduledCalls, deny: () => { allowed = false; }, requestCount: () => requests };
}
test('notification bridge cancels logged-day reminders, avoids duplicates, and respects disabling', async () => {
  const h = notificationHarness();
  await h.api.saveNotificationSettings({ enabled: true, daily: true, budgets: true, start: 19 });
  await h.api.syncNotifications([], []);
  assert.equal(h.scheduled.size, 41);
  await h.api.syncNotifications([], []);
  assert.equal(h.scheduled.size, 41);
  await h.api.syncNotifications([], [expense(100)]);
  assert.equal(h.scheduled.size, 40);
  assert.equal(h.scheduled.has('kuwenta-reminder-2026-10-12-14'), false);
  await h.api.saveNotificationSettings({ enabled: false, daily: true, budgets: true, start: 19 });
  assert.equal(h.scheduled.size, 0);
});
test('budget alerts are baselined on opt-in and delivered once per threshold across restarts and edits', async () => {
  const h = notificationHarness();
  const budgets = [{ month: '2026-10', category: 'Food', limitAmount: 1000 }];
  await h.api.saveNotificationSettings({ enabled: true, daily: false, budgets: true, start: 19 });
  await h.api.syncNotifications(budgets, []);
  await h.api.syncNotifications(budgets, [expense(800)]);
  assert.equal(h.delivered.length, 1);
  await h.api.syncNotifications(budgets, [expense(800)]);
  assert.equal(h.delivered.length, 1);
  await h.api.syncNotifications(budgets, [expense(1001)]);
  assert.equal(h.delivered.length, 2);
  await h.api.syncNotifications(budgets, [expense(799)]);
  await h.api.syncNotifications(budgets, [expense(800)]);
  assert.equal(h.delivered.length, 2);
  const reopened = notificationHarness(h.store);
  await reopened.api.syncNotifications(budgets, [expense(1001)]);
  assert.equal(reopened.delivered.length, 0);
  await reopened.api.syncNotifications(budgets, [expense(5000)], true);
  assert.equal(reopened.delivered.length, 0);
  const firstEnable = notificationHarness();
  await firstEnable.api.saveNotificationSettings({ enabled: true, daily: false, budgets: true, start: 19 });
  await firstEnable.api.syncNotifications(budgets, [expense(1001)]);
  assert.equal(firstEnable.delivered.length, 0);
});
test('denied notification permission keeps opt-in disabled and creates no reminders', async () => {
  const h = notificationHarness(); h.deny();
  await assert.rejects(h.api.saveNotificationSettings({ enabled: true, daily: true, budgets: true, start: 19 }), /not allowed/);
  assert.equal(h.api.getNotificationSettings().enabled, false);
  assert.equal(h.requestCount(), 1);
  await h.api.syncNotifications([], []);
  assert.equal(h.scheduled.size, 0);
});

test('Expo Go never loads the push module and safely skips notification observers and scheduling', async () => {
  const h = notificationHarness(new Map(), true);
  await h.api.syncNotifications([], []);
  h.api.observeNotificationTaps(() => { throw new Error('Unexpected navigation'); })();
  assert.equal(h.api.getNotificationSettings().enabled, false);
  await assert.rejects(h.api.saveNotificationSettings({ enabled: true, daily: true, budgets: true, start: 19 }), /Expo Go/);
  assert.equal(h.scheduled.size, 0);
});

test('old reminder windows migrate without losing opt-in or retaining duplicate schedules', async () => {
  const store = new Map([['kuwenta.notifications', JSON.stringify({ enabled: true, daily: true, budgets: true, start: 19 })]]);
  const h = notificationHarness(store);
  h.scheduled.set('kuwenta-reminder-2026-10-12', { identifier: 'kuwenta-reminder-2026-10-12' });
  await h.api.syncNotifications([], []);
  assert.equal(h.scheduled.size, 41);
  assert.equal(h.scheduled.has('kuwenta-reminder-2026-10-12'), false);
  assert.equal(h.api.getNotificationSettings().enabled, true);
  assert.equal('start' in h.api.getNotificationSettings(), false);
  await h.api.saveNotificationSettings({ enabled: true, daily: false, budgets: true });
  assert.equal(h.scheduled.size, 0);
  assert.equal(JSON.parse(store.get('kuwenta.notifications')).start, undefined);
});


test('phone reminders refresh old wording without changing their slots, duplicating reminders or touching other apps', async () => {
  const h = notificationHarness();
  await h.api.saveNotificationSettings({ enabled: true, daily: true, budgets: true });
  const identifier = 'kuwenta-reminder-2026-10-12-14';
  h.scheduled.set(identifier, { identifier, content: { title: 'Tracking reminder', body: "Record today's spending in Kuwenta." } });
  h.scheduled.set('other-reminder', { identifier: 'other-reminder', content: { title: 'Other', body: 'Keep this' } });
  await h.api.syncNotifications([], []);
  const afternoon = h.scheduled.get(identifier);
  assert.equal(afternoon.content.title, 'A little catch-up');
  assert.equal(afternoon.content.body, 'Any money activity to add to your records?');
  assert.equal(afternoon.trigger.date.toISOString(), '2026-10-12T06:00:00.000Z');
  assert.equal(h.scheduled.size, 42);
  assert.equal(h.scheduled.get('other-reminder').content.body, 'Keep this');
  const copy = new Set([...h.scheduled.values()].filter(item => item.identifier.startsWith('kuwenta-reminder-')).map(item => item.content.title));
  assert.deepEqual(copy, new Set(['Quick check-in', 'A little catch-up', 'Before you forget']));
  for (const item of h.scheduled.values()) {
    if (!item.identifier.startsWith('kuwenta-reminder-')) continue;
    assert.equal(item.content.sound, false);
    assert.equal(item.content.data.screen, 'home');
    assert.doesNotMatch(item.content.body, /Kuwenta|Plans|spend/i);
  }
  const callCount = h.scheduledCalls.length;
  await h.api.syncNotifications([], []);
  assert.equal(h.scheduledCalls.length, callCount);
  assert.equal(h.scheduled.size, 42);
});

test('phone budget messages stay neutral and private at both thresholds', () => {
  const budgets = [{ month: '2026-10', category: 'Food', limitAmount: 1000 }];
  const near = budgetAlertPlan(budgets, [expense(800)], '2026-10')[0];
  const over = budgetAlertPlan(budgets, [expense(1001)], '2026-10')[0];
  assert.equal(near.title, 'Budget update');
  assert.equal(near.body, 'Your recorded spending is close to a budget limit.');
  assert.equal(over.title, 'Budget update');
  assert.equal(over.body, 'Your recorded spending is over a budget limit.');
  for (const item of [near, over]) assert.doesNotMatch(item.body, /Kuwenta|Plans|Food|1000|1001/);
});


test('budget notification taps open their period and discard malformed scope data', () => {
 const h=notificationHarness(); const taps=[];
 const stop=h.api.observeNotificationTaps((screen,scope)=>taps.push([screen,scope]));
 h.tap({screen:'budgets',scope:'weekly:2026-10-12'});
 h.tap({screen:'budgets',scope:'daily:2026-10-13'});
 h.tap({screen:'budgets',scope:'weekly:not-a-date'});
 assert.deepEqual(taps,[['budgets','weekly:2026-10-12'],['budgets','daily:2026-10-13'],['budgets',undefined]]);
 stop();
});
