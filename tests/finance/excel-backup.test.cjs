const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { createExcelBackup, parseExcelBackup } = require('../../.expo/finance-tests/excel-backup.js');
const { serializeBackup, parseBackup } = require('../../.expo/finance-tests/backup.js');
const { cash, record } = require('./fixtures.cjs');
const stamp = '2026-10-12T00:00:00.000Z';
const savings = { ...cash, id: 'save', name: 'Laptop savings', purpose: 'savings', includedInAvailable: false, openingBalance: 0, color: 'teal' };
function snapshot() {
 return parseBackup(serializeBackup([cash, savings], [
  record({ id: 'expense', category: 'Personal Care', amount: 6025, notes: '=SUM(A1:A2)' }),
  record({ id: 'income', type: 'INCOME', category: 'Allowance', amount: 100000 }),
  record({ id: 'transfer', type: 'TRANSFER', category: 'Transfer', destinationAccountId: 'save', amount: 50000, sourcePurpose: 'spending', destinationPurpose: 'savings' }),
  record({ id: 'adjust', type: 'ADJUSTMENT', category: 'Balance adjustment', adjustmentDirection: 'decrease', amount: 150 }),
  record({ id: 'external', type: 'EXTERNAL', category: 'External transfer', adjustmentDirection: 'increase', externalName: 'Parent', amount: 20000 }),
 ], stamp, [{ id: 'goal', name: 'Laptop', accountId: 'save', targetAmount: 200000, targetDate: '2026-12-31', createdAt: stamp, updatedAt: stamp }], [{ month: '2026-10', category: 'Personal Care', limitAmount: 10000 }]));
}
function mutate(bytes, change) {
 const workbook = XLSX.read(bytes, { type: 'array', cellFormula: true });
 change(workbook);
 return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }));
}
function column(sheet, name) {
 const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
 return XLSX.utils.encode_cell({ r: 1, c: headers.indexOf(name) });
}

test('Excel round trips all accounts, movements, exact centavos, colors, budgets and goals', () => {
 const original = snapshot();
 const bytes = createExcelBackup(original);
 assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
 assert.deepEqual(parseExcelBackup(bytes), original);
 const workbook = XLSX.read(bytes, { type: 'array' });
 assert.deepEqual(workbook.SheetNames, ['Transactions', 'Accounts', 'Budgets', 'Goals', 'Kuwenta']);
 const transaction = XLSX.utils.sheet_to_json(workbook.Sheets.Transactions)[0];
 assert.equal(transaction['Amount (PHP)'], 60.25);
 assert.equal(transaction.Account, 'Cash');
 assert.equal(transaction.Notes, '=SUM(A1:A2)');
 assert.equal(transaction.Date, '2026-10-09');
 assert.equal(workbook.Sheets.Transactions[column(workbook.Sheets.Transactions, 'Notes')].f, undefined);
});

test('empty histories, negative balances and maximum supported amounts survive Excel', () => {
 for (const amount of [0, -12345, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
  const original = parseBackup(serializeBackup({ ...cash, openingBalance: amount }, [], stamp));
  assert.deepEqual(parseExcelBackup(createExcelBackup(original)), original);
 }
 const original = parseBackup(serializeBackup({ ...cash, openingBalance: 0 }, [record({ type: 'INCOME', category: 'Allowance', amount: Number.MAX_SAFE_INTEGER })], stamp));
 assert.deepEqual(parseExcelBackup(createExcelBackup(original)), original);
});

test('Kuwenta workbook validation rejects unrelated files, missing sheets and unsupported versions', () => {
 const bytes = createExcelBackup(snapshot());
 for (const change of [
  wb => { delete wb.Sheets.Accounts; wb.SheetNames = wb.SheetNames.filter(name => name !== 'Accounts'); },
  wb => { wb.Sheets.Kuwenta.B2.v = 'other-app'; },
  wb => { wb.Sheets.Kuwenta.B3.v = 99; },
  wb => { wb.Sheets.Transactions.A1.v = 'Unknown header'; },
 ]) assert.throws(() => parseExcelBackup(mutate(bytes, change)));
 assert.throws(() => parseExcelBackup(new Uint8Array([80, 75, 1, 2])), /valid Kuwenta/);
 const other = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(other, XLSX.utils.aoa_to_sheet([['Amount'], [100]]), 'Expenses');
 assert.throws(() => parseExcelBackup(new Uint8Array(XLSX.write(other, { type: 'array', bookType: 'xlsx' }))), /exported by Kuwenta/);
});

test('invalid references, duplicate IDs, formulas and invalid monetary edits never become restore payloads', () => {
 const bytes = createExcelBackup(snapshot());
 for (const change of [
  wb => { const s = wb.Sheets.Transactions; s[column(s, 'Account ID')].v = 'missing'; },
  wb => { const s = wb.Sheets.Transactions; s[column(s, 'Amount (PHP)')].v = -1; },
  wb => { const s = wb.Sheets.Transactions; s[column(s, 'Amount (PHP)')].v = 1.234; },
  wb => { const s = wb.Sheets.Transactions; s[column(s, 'Amount (PHP)')].f = '1+1'; },
  wb => { const s = wb.Sheets.Transactions; const c = column(s, 'Record ID'); s[c.replace('2', '3')].v = s[c].v; },
  wb => { const cell = wb.Sheets.Accounts[column(wb.Sheets.Accounts, 'Included in available')]; cell.v = 'yes'; cell.t = 's'; },
 ]) assert.throws(() => parseExcelBackup(mutate(bytes, change)));
});

test('ZIP expansion and worksheet dimensions are bounded before restoration', () => {
 const bytes = createExcelBackup(snapshot());
 const inflated = bytes.slice(); const view = new DataView(inflated.buffer);
 for (let i = 0; i < inflated.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 50 * 1024 * 1024, true); break; }
 assert.throws(() => parseExcelBackup(inflated), /too much data/);
 assert.throws(() => parseExcelBackup(mutate(bytes, wb => { wb.Sheets.Goals['!ref'] = 'A1:G50002'; })), /oversized/);
 assert.throws(() => parseExcelBackup(bytes.slice(0, -10)), /valid Kuwenta/);
});
