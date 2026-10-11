const test = require('node:test');
const assert = require('node:assert/strict');
const { reminderPlan, budgetAlertPlan } = require('../../.expo/finance-tests/notification-plan.js');
const { philippineDateTime } = require('../../.expo/finance-tests/dates.js');
const now = new Date('2026-10-12T02:00:00Z');
function expense(amount, overrides = {}) { return { id: 'one', type: 'EXPENSE', amount, category: 'Food', accountId: 'cash', transactionDate: '2026-10-12', transactionTime: '10:00:00', createdAt: now.toISOString(), updatedAt: now.toISOString(), ...overrides }; }
test('reminders vary within the PH window, once per day, and never schedule in the past', () => {
  const plan = reminderPlan(now, 19, 21, [], day => Number(day.slice(-2)) / 32);
  assert.equal(plan.length, 30);
  assert.equal(new Set(plan.map(p => p.day)).size, 30);
  for (const item of plan) {
    const ph = philippineDateTime(item.date);
    assert.equal(ph.transactionDate, item.day);
    assert.ok(ph.transactionTime >= '19:00:00' && ph.transactionTime < '21:00:00');
    assert.ok(item.date > now);
  }
  assert.notEqual(plan[0].date.toISOString().slice(11,16), plan[1].date.toISOString().slice(11,16));
  assert.equal(reminderPlan(new Date('2026-10-12T14:00:00Z'), 19, 21, [], () => .5)[0].day, '2026-10-13');
});
test('logging a backdated entry skips the recording day, but adjustments alone do not', () => {
  const record = expense(100, { transactionDate: '2026-09-01' });
  assert.equal(reminderPlan(now, 19, 21, [record], () => .5)[0].day, '2026-10-13');
  assert.equal(reminderPlan(now, 19, 21, [expense(100, { type: 'ADJUSTMENT' })], () => .5)[0].day, '2026-10-12');
});
test('stable day randomness keeps the same reminder after refresh and across months', () => {
  const plan = reminderPlan(new Date('2026-12-31T01:00:00Z'), 12, 14, [], () => .25);
  const again = reminderPlan(new Date('2026-12-31T02:00:00Z'), 12, 14, [], () => .25);
  assert.deepEqual(plan, again);
  assert.equal(plan[1].day, '2027-01-01');
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
  let allowed = true;
  let requests = 0;
  const native = {
    setNotificationHandler() {},
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ granted: allowed }),
    requestPermissionsAsync: async () => { requests++; return { granted: allowed }; },
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    cancelScheduledNotificationAsync: async id => { scheduled.delete(id); },
    scheduleNotificationAsync: async item => {
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
    if (name === './dates') return { philippineDateTime };
    throw new Error('Unexpected dependency: ' + name);
  } };
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.exports, store: existingStore, scheduled, delivered, deny: () => { allowed = false; }, requestCount: () => requests };
}
test('notification bridge cancels logged-day reminders, avoids duplicates, and respects disabling', async () => {
  const h = notificationHarness();
  await h.api.saveNotificationSettings({ enabled: true, daily: true, budgets: true, start: 19 });
  await h.api.syncNotifications([], []);
  assert.equal(h.scheduled.size, 30);
  await h.api.syncNotifications([], []);
  assert.equal(h.scheduled.size, 30);
  await h.api.syncNotifications([], [expense(100)]);
  assert.equal(h.scheduled.size, 29);
  assert.equal(h.scheduled.has('kuwenta-reminder-2026-10-12'), false);
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
