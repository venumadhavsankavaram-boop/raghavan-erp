// Leave statement: the day-by-day list, reasons from applications, and paid / loss-of-pay split that always matches the payslip numbers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'public/modules/84-leave-statement.js'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const pay = fs.readFileSync(path.join(root, 'public/modules/17-staff-assignments-wizard-payroll.js'), 'utf8');

function boot({ recs, preview, requests = [], single = false }) {
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {}, querySelector: () => null });
  const ctx = vm.createContext({
    console, Date, Math, Number, String, Array, Object, JSON, Promise, setTimeout: () => 0, isFinite,
    staffList: [{ id: 's1', firstName: 'Anu', lastName: 'Rao', designation: 'Teacher', department: 'Primary', staffId: 'T01' }],
    staffAttendanceRecords: recs, currentUser: { role: 'Admin' },
    computeStaffPayroll: (id, m) => preview(m), payrollPeriod: m => ({ from: m + '-01', to: m + '-31' }),
    attIsSingleSession: () => single, payslipExtraMeta: () => '<div>base</div>',
    fetch: async () => ({ ok: true, json: async () => requests }),
    document: { getElementById: () => null, querySelector: () => null, createElement: el, head: { appendChild() {} }, body: { appendChild() {} } },
  });
  ctx.window = ctx; vm.runInContext(src, ctx); return ctx;
}
const R = (date, status, session) => ({ staffId: 's1', date, status, session: session || null });
const P = (o) => m => ({ leaveDays: 2, quota: 1, lopDays: 1, lopDeduction: 500, netSalary: 14500, basic: 15000, ...o });

test('every leave day appears with its reason, approver and paid / loss-of-pay result', () => {
  const reqs = [{ id: 'q1', staffId: 's1', status: 'Approved', fromDate: '2026-10-05', toDate: '2026-10-05', reason: 'Fever', decidedByName: 'Principal', decidedAt: '2026-10-04T10:00:00Z', requestedAt: '2026-10-03T10:00:00Z' }];
  const c = boot({ recs: [R('2026-10-05', 'Leave'), R('2026-10-12', 'Leave')], preview: P({}) });
  const b = c.__ls.build('s1', '2026-10', reqs);
  assert.equal(b.rows.length, 2);
  assert.equal(b.rows[0].reason, 'Fever'); assert.equal(b.rows[0].decidedBy, 'Principal'); assert.equal(b.rows[0].effect, 'Paid');
  assert.equal(b.rows[1].applied, false); assert.equal(b.rows[1].effect, 'Loss of pay');
});
test('the first days use the paid allowance and later days are loss of pay, matching the payslip', () => {
  const c = boot({ recs: ['01', '02', '03', '04'].map(d => R('2026-10-' + d, 'Leave')), preview: P({ leaveDays: 4, quota: 2, lopDays: 2 }) });
  const b = c.__ls.build('s1', '2026-10', []);
  assert.equal(JSON.stringify(b.rows.map(x => x.effect)), JSON.stringify(['Paid', 'Paid', 'Loss of pay', 'Loss of pay']));
  assert.equal(b.rows.filter(x => x.effect === 'Loss of pay').reduce((n, x) => n + x.days, 0), 2);
});
test('a half day is shown as a half day and can be part paid', () => {
  const c = boot({ recs: [R('2026-10-05', 'Leave', 'Morning'), R('2026-10-06', 'Leave')], preview: P({ leaveDays: 1.5, quota: 1, lopDays: 0.5 }) });
  const b = c.__ls.build('s1', '2026-10', []);
  assert.equal(b.rows[0].days, 0.5); assert.ok(/Morning/.test(b.rows[0].part));
  assert.equal(b.rows[0].effect, 'Paid'); assert.equal(b.rows[1].effect, 'Part paid');
});
test('when only absent days count, leave days are shown as paid and not counted', () => {
  const c = boot({ recs: [R('2026-10-05', 'Leave'), R('2026-10-06', 'Absent')], preview: P({ leaveDays: 1, quota: 0, lopDays: 1 }) });
  const b = c.__ls.build('s1', '2026-10', []);
  assert.equal(b.absentOnly, true); assert.equal(b.rows[0].effect, 'Paid'); assert.equal(b.rows[0].counted, false); assert.equal(b.rows[1].effect, 'Loss of pay');
});
test('days outside the pay period and other staff are left out; no leave gives a clear sentence', () => {
  const c = boot({ recs: [R('2026-09-30', 'Leave'), { staffId: 'other', date: '2026-10-05', status: 'Leave' }], preview: P({ leaveDays: 0, lopDays: 0, lopDeduction: 0 }) });
  const b = c.__ls.build('s1', '2026-10', []);
  assert.equal(b.rows.length, 0); assert.ok(/nothing is deducted/.test(c.__ls.explain(b)));
});
test('the plain-language line and the WhatsApp copy state the deduction and reasons', () => {
  const c = boot({ recs: [R('2026-10-05', 'Leave'), R('2026-10-06', 'Leave')], preview: P({}), requests: [] });
  const b = c.__ls.build('s1', '2026-10', [{ staffId: 's1', status: 'Approved', fromDate: '2026-10-05', toDate: '2026-10-05', reason: 'Wedding', decidedByName: 'Admin' }]);
  assert.ok(/beyond the allowance/.test(c.__ls.explain(b)) && /deducted/.test(c.__ls.explain(b)));
  const t = c.__ls.textCopy(b, [{ ym: '2026-10', taken: 2, quota: 1, lop: 1, cut: 500 }]);
  assert.ok(/Reason: Wedding/.test(t) && /approved by Admin/.test(t) && /Loss of pay/.test(t));
});
test('the payslip gets a leave block and keeps the original lines', () => {
  const c = boot({ recs: [R('2026-10-05', 'Leave')], preview: P({ leaveDays: 1, quota: 1, lopDays: 0 }) });
  const html = c.payslipExtraMeta({ id: 's1' }, '2026-10', {});
  assert.ok(html.includes('<div>base</div>') && /Leave in this period/.test(html));
  const none = boot({ recs: [], preview: P({ leaveDays: 0, lopDays: 0 }) }).payslipExtraMeta({ id: 's1' }, '2026-10', {});
  assert.equal(none, '<div>base</div>');
});
test('wiring: module loaded after the Help Centre, and the Payroll row has the button', () => {
  assert.ok(idx.indexOf('83-help-centre.js') < idx.indexOf('84-leave-statement.js'));
  assert.ok(/openLeaveStatement\('\$\{st\.id\}','\$\{staffPayrollMonth\}'\)/.test(pay));
});
done();
