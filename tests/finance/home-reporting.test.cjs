const {test}=require('node:test');
const assert=require('node:assert/strict');
const {homeReportingPeriod}=require('../../.expo/finance-tests/reporting/home-reporting.js');
const now=new Date('2026-11-02T04:00:00Z');
test('shared Home periods cross month and year boundaries using Philippine dates',()=>{
 const week=homeReportingPeriod('last-week','2026-11',now);assert.equal(week.start,'2026-10-26');assert.equal(week.end,'2026-11-01');
 const last=homeReportingPeriod('last-month','2026-11',now);assert.equal(last.start,'2026-10-01');assert.equal(last.end,'2026-10-31');
 const jan=homeReportingPeriod('last-month','2027-01',new Date('2026-12-31T16:01:00Z'));assert.equal(jan.start,'2026-12-01');assert.equal(jan.end,'2026-12-31');
 const leap=homeReportingPeriod('custom','2024-02',now);assert.equal(leap.end,'2024-02-29');assert.match(leap.label,/February 2024/);
 assert.throws(()=>homeReportingPeriod('custom','2024-13',now));
});
test('relative periods advance with the date; an explicitly chosen month stays fixed',()=>{
 const before=homeReportingPeriod('week','2026-10',new Date('2026-11-01T04:00:00Z'));
 const after=homeReportingPeriod('week','2026-10',now);assert.equal(before.start,'2026-10-26');assert.equal(after.start,'2026-11-02');
 assert.equal(homeReportingPeriod('custom','2026-10',now).start,'2026-10-01');
 const first=homeReportingPeriod('last-week','1900-01',new Date('1900-01-01T04:00:00Z'));assert.equal(first.start,'1900-01-01');
});


test('spending calendars keep Monday alignment and all dates in exactly six rows',()=>{
 const {spendingCalendarRows}=require('../../.expo/finance-tests/reporting/home-reporting.js');
 const {dashboardSpending}=require('../../.expo/finance-tests/reporting/dashboard.js');
 for(const [month,calendarWeeks] of [['2021-02',4],['2026-04',5],['2026-08',6],['2024-02',5]]){
  const days=dashboardSpending([],'month',month,now),rows=spendingCalendarRows(days);
  assert.equal(rows.length,6);assert.ok(rows.every(row=>row.length===7));
  assert.equal(rows.filter(row=>row.some(Boolean)).length,calendarWeeks);
  assert.deepEqual(rows.flat().filter(Boolean).map(day=>day.date),days.map(day=>day.date));
  assert.equal(rows.flat().findIndex(Boolean),(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7);
 }
 assert.equal(spendingCalendarRows([]).flat().filter(Boolean).length,0);
});
