// Staff attendance is counted in DAYS and payroll loss-of-pay follows it.   Run:  node tests/staff-attendance-payroll.test.mjs
import assert from 'node:assert/strict';
import { loadMany, test, done, plain } from './helpers.mjs';

function sandbox(records, staff) {
  return loadMany([
    ['09-fees-subtabs.js', ['attSingleRange', 'attIsSingleSession', 'staffAttDayFractions', 'staffAttDaysByStatus', 'computeStaffAttendanceStats']],
    ['17-staff-assignments-wizard-payroll.js', ['daysInPayrollMonth', 'staffAttendanceCountInMonth', 'computeStaffPayroll']],
  ], { staffAttendanceRecords: records, staffList: staff || [], attSettings: {} });
}
const R = (date, status, session) => ({ staffId: 's1', date, status, ...(session ? { session } : {}) });

console.log('Counting days (not sessions)');
test('a legacy full-day record is one day', () => {
  const E = sandbox([R('2026-10-01', 'Present')]);
  assert.deepEqual(plain(E.computeStaffAttendanceStats('s1')), { present: 1, absent: 0, late: 0, leave: 0, total: 1, pct: 100 });
});
test('Morning + Afternoon present is ONE day, not two', () => {
  const E = sandbox([R('2026-10-02', 'Present', 'Morning'), R('2026-10-02', 'Present', 'Afternoon')]);
  const s = E.computeStaffAttendanceStats('s1');
  assert.equal(s.present, 1); assert.equal(s.total, 1);
});
test('Morning present + Afternoon absent is half a day each', () => {
  const E = sandbox([R('2026-10-03', 'Present', 'Morning'), R('2026-10-03', 'Absent', 'Afternoon')]);
  const s = E.computeStaffAttendanceStats('s1');
  assert.equal(s.present, 0.5); assert.equal(s.absent, 0.5); assert.equal(s.total, 1); assert.equal(s.pct, 50);
});
test('a legacy row and session rows for the same date are not double counted', () => {
  const E = sandbox([R('2026-10-04', 'Present'), R('2026-10-04', 'Present', 'Morning'), R('2026-10-04', 'Present', 'Afternoon')]);
  assert.equal(E.computeStaffAttendanceStats('s1').total, 1);
});
test('a session marked twice counts once (last write wins)', () => {
  const E = sandbox([R('2026-10-05', 'Absent', 'Morning'), R('2026-10-05', 'Present', 'Morning'), R('2026-10-05', 'Present', 'Afternoon')]);
  const s = E.computeStaffAttendanceStats('s1');
  assert.equal(s.total, 1); assert.equal(s.present, 1);
});
test('single-session period (15 Mar–31 May): Morning only is a full day', () => {
  const E = sandbox([R('2026-04-10', 'Present', 'Morning')]);
  const s = E.computeStaffAttendanceStats('s1');
  assert.equal(s.present, 1); assert.equal(s.total, 1);
});
test('outside that period a Morning-only mark is half a day', () => {
  const E = sandbox([R('2026-10-06', 'Present', 'Morning')]);
  assert.equal(E.computeStaffAttendanceStats('s1').total, 0.5);
});
test('late counts as attended; leave counts against', () => {
  const E = sandbox([R('2026-10-07', 'Late'), R('2026-10-08', 'Leave'), R('2026-10-09', 'Present'), R('2026-10-10', 'Absent')]);
  const s = E.computeStaffAttendanceStats('s1');
  assert.equal(s.pct, 50); assert.equal(s.total, 4);
});
test('the date range limits the count (From/To are inclusive)', () => {
  const E = sandbox([R('2026-09-30', 'Present'), R('2026-10-01', 'Present'), R('2026-10-31', 'Absent'), R('2026-11-01', 'Present')]);
  const s = E.computeStaffAttendanceStats('s1', '2026-10-01', '2026-10-31');
  assert.equal(s.total, 2); assert.equal(s.present, 1); assert.equal(s.absent, 1);
});
test('other staff members are never mixed in', () => {
  const E = sandbox([R('2026-10-01', 'Present'), { staffId: 's2', date: '2026-10-01', status: 'Absent' }]);
  assert.equal(E.computeStaffAttendanceStats('s1').absent, 0);
});
test('a full month marked with both sessions never exceeds the working days', () => {
  const rec = []; for (let d = 1; d <= 24; d++) { const ds = '2026-10-' + String(d).padStart(2, '0'); rec.push(R(ds, 'Present', 'Morning'), R(ds, 'Present', 'Afternoon')); }
  assert.equal(sandbox(rec).computeStaffAttendanceStats('s1', '2026-10-01', '2026-10-31').total, 24);
});

console.log('\nPayroll loss of pay');
const staff = [{ id: 's1', salary: 31000, paidLeavesPerMonth: 1 }];
test('days absent above the paid-leave quota are deducted at salary ÷ days in month', () => {
  const E = sandbox([R('2026-10-01', 'Absent'), R('2026-10-02', 'Absent'), R('2026-10-03', 'Leave')], staff);
  const p = E.computeStaffPayroll('s1', '2026-10');
  assert.equal(p.leaveDays, 3); assert.equal(p.lopDays, 2); assert.equal(p.lopDeduction, 2000); assert.equal(p.netSalary, 29000);
});
test('within the paid-leave quota nothing is deducted', () => {
  const E = sandbox([R('2026-10-01', 'Leave')], staff);
  assert.equal(E.computeStaffPayroll('s1', '2026-10').lopDeduction, 0);
});
test('half-day absence deducts half a day', () => {
  const E = sandbox([R('2026-10-01', 'Absent', 'Afternoon'), R('2026-10-01', 'Present', 'Morning'), R('2026-10-02', 'Absent'), R('2026-10-03', 'Absent')], [{ id: 's1', salary: 31000, paidLeavesPerMonth: 0 }]);
  assert.equal(E.computeStaffPayroll('s1', '2026-10').lopDays, 2.5);
});
test('both sessions marked absent is one day, not two', () => {
  const E = sandbox([R('2026-10-01', 'Absent', 'Morning'), R('2026-10-01', 'Absent', 'Afternoon')], [{ id: 's1', salary: 31000, paidLeavesPerMonth: 0 }]);
  assert.equal(E.computeStaffPayroll('s1', '2026-10').lopDays, 1);
});
test('EPF/ESI, bonus and other deductions flow into net pay', () => {
  const st = [{ id: 's1', salary: 30000, paidLeavesPerMonth: 1, epfEnabled: true, epfEmployeeAmount: 1800, esiEnabled: true, esiEmployeeAmount: 225, otherMonthlyDeduction: 100 }];
  const p = sandbox([], st).computeStaffPayroll('s1', '2026-10', { bonus: 500 });
  assert.equal(p.grossSalary, 30500); assert.equal(p.totalDeductions, 2125); assert.equal(p.netSalary, 28375);
});
test('the month length is real (Feb 2028 has 29 days)', () => {
  assert.equal(sandbox([]).daysInPayrollMonth('2028-02'), 29);
});
done('staff attendance + payroll');
