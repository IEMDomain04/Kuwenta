import { budgetPeriodRange } from './budget-periods';
import * as XLSX from 'xlsx';
import { parseBackup, type FinanceBackup } from './backup';
import { moneyInput, parseMoney } from './money';

// Preserve exact centavos, stable IDs, and date strings while keeping sheets readable.
type Column = [key: string, label: string, kind?: 'money' | 'boolean' | 'json', optional?: boolean];
const tables: { name: string; key: 'accounts' | 'transactions' | 'budgets' | 'goals'; columns: Column[] }[] = [
  { name: 'Transactions', key: 'transactions', columns: [
    ['transactionDate', 'Date'], ['transactionTime', 'Time'], ['type', 'Type'], ['category', 'Category'],
    ['amount', 'Amount (PHP)', 'money'], ['_accountName', 'Account'], ['_destinationName', 'Destination', undefined, true],
    ['notes', 'Notes', undefined, true], ['id', 'Record ID'], ['accountId', 'Account ID'],
    ['destinationAccountId', 'Destination ID', undefined, true], ['sourcePurpose', 'Source purpose', undefined, true],
    ['destinationPurpose', 'Destination purpose', undefined, true], ['adjustmentDirection', 'Adjustment direction', undefined, true],
    ['externalName', 'External source', undefined, true], ['exchange', 'Exchange details', 'json', true], ['exchangeParentId', 'Linked exchange ID', undefined, true], ['createdAt', 'Created at'], ['updatedAt', 'Updated at'],
  ] },
  { name: 'Accounts', key: 'accounts', columns: [
    ['id', 'Account ID'], ['name', 'Name'], ['currency', 'Currency'], ['openingBalance', 'Starting balance (PHP)', 'money'],
    ['purpose', 'Purpose'], ['includedInAvailable', 'Included in available', 'boolean'], ['archived', 'Archived', 'boolean'],
    ['color', 'Card color', undefined, true], ['icon', 'Account icon', undefined, true],
  ] },
  { name: 'Budgets', key: 'budgets', columns: [
    ['_period', 'Period'], ['_start', 'Start date'], ['_end', 'End date'], ['month', 'Month'], ['category', 'Category'], ['limitAmount', 'Limit (PHP)', 'money'],
  ] },
  { name: 'Goals', key: 'goals', columns: [
    ['id', 'Goal ID'], ['name', 'Name'], ['accountId', 'Account ID'], ['targetAmount', 'Target (PHP)', 'money'],
    ['targetDate', 'Target date', undefined, true], ['createdAt', 'Created at'], ['updatedAt', 'Updated at'],
  ] },
];
const MAX_ROWS = 50000;
const MAX_BYTES = 10 * 1024 * 1024;

function moneyCell(value: number): number | string {
  const numeric = value / 100;
  // Excel numbers have limited precision. Use text when it cannot round-trip exactly.
  try {
    if (String(value).replace('-', '').length <= 15 && parseMoney(String(numeric), { allowNegative: true, allowZero: true }) === value) return numeric;
  } catch { /* Keep large amounts as exact decimal text. */ }
  return moneyInput(value);
}

/** A real .xlsx workbook, with all financial records required for restoration. */
export function createExcelBackup(backup: FinanceBackup): Uint8Array {
  const validated = parseBackup(JSON.stringify(backup));
  const workbook = XLSX.utils.book_new();
  const names = new Map(validated.accounts.map(account => [account.id, account.name]));
  for (const table of tables) {
    const records = validated[table.key] ?? [];
    if (records.length > MAX_ROWS) throw new Error('This backup has too many rows for Excel. Export JSON instead.');
    const rows = records.map(record => {
      const row = record as unknown as Record<string, unknown>;
      return table.columns.map(([key, , kind]) => {
        if (table.key === 'budgets' && key.startsWith('_')) { const range = budgetPeriodRange(row.month as string); return key === '_period' ? range.period : key === '_start' ? range.start : range.end; }
        if (key === '_accountName') return names.get(row.accountId as string) ?? '';
        if (key === '_destinationName') return names.get(row.destinationAccountId as string) ?? null;
        const value = row[key];
        if (typeof value === 'string' && value.length > 32767) throw new Error('A text field is too long for Excel. Export JSON instead.');
        return value === undefined ? null : kind === 'money' ? moneyCell(value as number) : kind === 'json' ? JSON.stringify(value) : value as string | boolean;
      });
    });
    const sheet = XLSX.utils.aoa_to_sheet([table.columns.map(column => column[1]), ...rows]);
    sheet['!cols'] = table.columns.map(([key, , kind]) => ({ wch: kind === 'money' ? 20 : key === 'notes' ? 36 : 22, hidden: table.name === 'Transactions' && (key === 'id' || key.endsWith('Id')) || table.key === 'budgets' && key === 'month' }));
    sheet['!autofilter'] = { ref: sheet['!ref']! };
    table.columns.forEach(([, , kind], column) => {
      if (kind !== 'money') return;
      for (let row = 1; row <= rows.length; row++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell?.t === 'n') cell.z = '#,##0.00';
      }
    });
    XLSX.utils.book_append_sheet(workbook, sheet, table.name);
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Key', 'Value'], ['format', 'kuwenta-excel'], ['workbookVersion', 3], ['backupVersion', validated.version],
    ['currency', validated.currency], ['timezone', validated.timezone], ['exportedAt', validated.exportedAt],
  ]), 'Kuwenta');
  const bytes = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }));
  if (bytes.length > MAX_BYTES) throw new Error('Backup files must be 10 MB or smaller.');
  return bytes;
}

// XLSX is compressed ZIP: bound expanded size before the spreadsheet parser allocates it.
function checkArchive(bytes: Uint8Array): void {
  if (bytes.length > MAX_BYTES) throw new Error('Backup files must be 10 MB or smaller.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error('Choose a valid Kuwenta Excel (.xlsx) backup.');
  const count = view.getUint16(end + 10, true);
  const offset = view.getUint32(end + 16, true);
  const length = view.getUint32(end + 12, true);
  if (count > 1000 || offset + length > end || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new Error('Unsupported Excel backup.');
  let cursor = offset, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > offset + length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Damaged Excel backup.');
    expanded += view.getUint32(cursor + 24, true);
    if (expanded > 40 * 1024 * 1024) throw new Error('Excel backup expands to too much data. Use a smaller backup.');
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  if (cursor !== offset + length) throw new Error('Damaged Excel backup.');
}

/** Only recognized, fully validated Kuwenta workbooks reach the restore preview. */
export function parseExcelBackup(bytes: Uint8Array): FinanceBackup {
  checkArchive(bytes);
  const workbook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellDates: false, cellText: false, sheetRows: MAX_ROWS + 2 });
  const expected = [...tables.map(table => table.name), 'Kuwenta'];
  if (workbook.SheetNames.length !== expected.length || expected.some(name => !workbook.Sheets[name])) throw new Error('Choose an Excel backup exported by Kuwenta, with all backup sheets.');
  function cell(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
    const value = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
    if (value?.f || value?.t === 'e') throw new Error('Excel backups cannot contain formulas or cell errors.');
    return value?.v;
  }
  const metadata = workbook.Sheets.Kuwenta;
  const keys = ['format', 'workbookVersion', 'backupVersion', 'currency', 'timezone', 'exportedAt'];
  if (cell(metadata, 0, 0) !== 'Key' || cell(metadata, 0, 1) !== 'Value') throw new Error('Missing Kuwenta backup information.');
  const info: Record<string, unknown> = {};
  keys.forEach((key, index) => {
    if (cell(metadata, index + 1, 0) !== key) throw new Error('Invalid Kuwenta backup information.');
    info[key] = cell(metadata, index + 1, 1);
  });
  if (info.format !== 'kuwenta-excel' || (info.workbookVersion !== 1 && info.workbookVersion !== 2 && info.workbookVersion !== 3)) throw new Error('Unsupported Kuwenta Excel backup version.');
  const result: Record<string, unknown> = { format: 'kuwenta-finance', version: info.backupVersion, currency: info.currency, timezone: info.timezone, exportedAt: info.exportedAt };
  for (const original of tables) {
    const table = info.workbookVersion === 1 ? { ...original, columns: original.columns.filter(([key]) => key !== 'icon' && !(original.key === 'budgets' && key.startsWith('_')) && !['exchange','exchangeParentId'].includes(key)) } : info.workbookVersion === 2 ? { ...original, columns: original.columns.filter(([key]) => !['exchange','exchangeParentId'].includes(key)) } : original;
    const sheet = workbook.Sheets[table.name];
    const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1');
    if (range.s.r !== 0 || range.s.c !== 0 || range.e.r > MAX_ROWS || range.e.c !== table.columns.length - 1) throw new Error('Invalid or oversized ' + table.name + ' backup sheet.');
    table.columns.forEach(([, label], column) => {
      if (cell(sheet, 0, column) !== label) throw new Error('Invalid ' + table.name + ' backup columns.');
    });
    const rows: Record<string, unknown>[] = [];
    for (let row = 1; row <= range.e.r; row++) {
      const record: Record<string, unknown> = {};
      table.columns.forEach(([key, , kind, optional], column) => {
        const value = cell(sheet, row, column);
        if (key.startsWith('_')) return; // Display names; stable account IDs define references.
        if (value === undefined || value === null || value === '' && optional && key !== 'notes') {
          if (!optional) throw new Error('Missing value in ' + table.name + ', row ' + (row + 1) + '.');
          return;
        }
        if (kind === 'money') {
          if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Invalid amount in Excel backup.');
          record[key] = parseMoney(String(value), { allowNegative: key === 'openingBalance', allowZero: key === 'openingBalance' });
        } else if (kind === 'json') {
          if (typeof value !== 'string') throw new Error('Invalid exchange details in Excel backup.');
          try { record[key] = JSON.parse(value); } catch { throw new Error('Invalid exchange details in Excel backup.'); }
        } else {
          if (typeof value !== (kind === 'boolean' ? 'boolean' : 'string')) throw new Error('Invalid value in ' + table.name + ', row ' + (row + 1) + '.');
          record[key] = value;
        }
      });
      rows.push(record);
    }
    result[table.key] = rows;
  }
  const json = JSON.stringify(result);
  if (new TextEncoder().encode(json).length > MAX_BYTES) throw new Error('Backup files must be 10 MB or smaller.');
  return parseBackup(json);
}
