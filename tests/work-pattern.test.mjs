// Part-time work pattern + register lock helpers.   Run:  node tests/work-pattern.test.mjs
import assert from 'node:assert/strict';
import { load, test, done } from './helpers.mjs';
const g = { attIsSingleSession: d => d >= '2027-03-15' && d <= '2027-05-31', staffList: [{ id: 'm', workSession: 'Morning' }, { id: 'f' }], staffAttendanceRecords: [], currentUser: { role: 'Teacher' }, attendanceRecords: [], attMarkDate: '2027-01-10', attMarkSession: 'Morning', staffAttMarkDate: '2027-01-10', staffAttMarkSession: 'Morning' };
const c = load('09-fees-subtabs.js', ['staffWorkPattern', 'staffWorksSession', 'staffAttDayFractions', 'attIsLocked', 'staffAttIsLocked'], g);
test('one-session staff only appear in their own session', () => {
  assert.equal(c.staffWorksSession({ workSession: 'Morning' }, '2027-01-10', 'Morning'), true);
  assert.equal(c.staffWorksSession({ workSession: 'Morning' }, '2027-01-10', 'Afternoon'), false);
  assert.equal(c.staffWorksSession({ workSession: 'Afternoon' }, '2027-01-10', 'Morning'), false);
  assert.equal(c.staffWorksSession({}, '2027-01-10', 'Afternoon'), true);
});
test('on single-session dates everyone shows in the one register', () => {
  assert.equal(c.staffWorksSession({ workSession: 'Afternoon' }, '2027-04-01', 'Morning'), true);
});
test('a morning-only staff member marked in their session counts as a full day', () => {
  g.staffAttendanceRecords.push({ staffId: 'm', date: '2027-01-10', session: 'Morning', status: 'Absent' }, { staffId: 'f', date: '2027-01-10', session: 'Morning', status: 'Absent' });
  c.staffAttendanceRecords = g.staffAttendanceRecords;
  assert.equal(c.staffAttDayFractions('m', '2027-01-01', '2027-01-31')[0].frac, 1);
  assert.equal(c.staffAttDayFractions('f', '2027-01-01', '2027-01-31')[0].frac, 0.5);
});
test('a marked slot is locked for a teacher, open for an Admin, and empty slots stay open', () => {
  c.attendanceRecords = [{ studentId: 's1', date: '2027-01-10', session: 'Morning', status: 'Present' }];
  assert.equal(c.attIsLocked('s1'), true); assert.equal(c.attIsLocked('s2'), false);
  c.currentUser = { role: 'Admin' }; assert.equal(c.attIsLocked('s1'), false); c.currentUser = { role: 'Principal' }; assert.equal(c.attIsLocked('s1'), false);
});
done();
