// Payroll: pay period (e.g. 26th to 25th), cheque / bank / cash disbursement, staff left off the payroll.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const m17 = rd('public/modules/17-staff-assignments-wizard-payroll.js'), m81 = rd('public/modules/81-payroll-pro.js');

function boot(settings, staff, records) {
  const calls = { att: [], saved: [], toasts: [], excel: [] };
  const ctx = vm.createContext({
    console, Date, Math, Number, String, Array, Object, JSON, isFinite, Promise, setTimeout, Blob: class {}, URL: { createObjectURL: () => 'x', revokeObjectURL() {} },
    staffList: staff, staffPayrollRecords: records, OBJECT_BACKED_KEYS: {}, STAFF_KEY: 'staff-records', STAFF_PAYROLL_KEY: 'staff-payroll',
    currentUser: { name: 'Admin Tester', role: 'Admin' },
    staffIsActive: st => (st.status || 'Active').toLowerCase() === 'active',
    staffAttDaysByStatus: (id, from, to) => { calls.att.push([id, from, to]); return ctx.__leave || 0; },
    getStaffSubpageAccess: () => true, getRolePermission: () => true, fmtMoney: n => '₹' + n,
    storageGet: async () => settings, storageSet: async (k, v) => { calls.saved.push(k); },
    showToast: m => calls.toasts.push(m), showConfirmDialog: async () => true, renderStaffBody() {},
    exportRowsToExcel: (n, s, rows) => calls.excel.push(rows), exportRowsToPDF() {},
    document: { getElementById: () => null, querySelectorAll: () => [], head: { appendChild() {} }, createElement: () => ({}) },
    schoolInfo: {}, openStaffProfile() {}, numberToWordsIndian: () => '',
  });
  ctx.window = ctx;
  vm.runInContext('async function loadStaffPayroll(){}', ctx);
  vm.runInContext('function onStaffPayrollMonthChange(){}', ctx);
  vm.runInContext('function renderStaffPayrollTab(){}', ctx);
  vm.runInContext(m17.replace(/function renderStaffPayrollTab[\s\S]*?\n  \}\n  \/\* ===== Individual Payslip/, 'function renderStaffPayrollTabX(){}\n  /* ===== Individual Payslip'), ctx);
  vm.runInContext(m81, ctx);
  return { ctx, calls };
}
const staff = () => [
  { id: 'a', firstName: 'Asha', lastName: 'Rao', designation: 'Teacher', salary: 31000, status: 'Active', bankAccountNumber: '123456789', bankIfsc: 'SBIN0001234', bankName: 'SBI' },
  { id: 'b', firstName: 'Bhaskar', lastName: 'K', designation: 'Principal', salary: 60000, status: 'Active' },
  { id: 'c', firstName: 'Chitra', lastName: 'M', designation: 'Teacher', salary: 20000, status: 'Active', payMode: 'Cash' },
  { id: 'd', firstName: 'Dev', lastName: 'P', designation: 'Clerk', salary: 15000, status: 'Active', payMode: 'Cheque' },
  { id: 'e', firstName: 'Esha', lastName: 'T', designation: 'Teacher', salary: 18000, status: 'Active' },
];
const approved = (id, net) => ({ id: 'pay_' + id, staffId: id, month: '2026-11', status: 'Approved', netSalary: net });

test('a 26th to 25th pay period runs from the 26th of the earlier month, and January reaches back to December', async () => {
  const { ctx } = boot({ periodStartDay: 26 }, staff(), []);
  await ctx.loadStaffPayroll();
  const p = ctx.payrollPeriod('2026-11'); assert.equal(p.from, '2026-10-26'); assert.equal(p.to, '2026-11-25'); assert.equal(p.days, 31);
  const j = ctx.payrollPeriod('2027-01'); assert.equal(j.from, '2026-12-26'); assert.equal(j.to, '2027-01-25');
  const f = ctx.payrollPeriod('2028-03'); assert.equal(f.from, '2028-02-26'); assert.equal(f.days, 29 - 26 + 1 + 25);
});
test('the normal calendar month stays the default', async () => {
  const { ctx } = boot({}, staff(), []); await ctx.loadStaffPayroll();
  const p = ctx.payrollPeriod('2026-02'); assert.equal(p.from, '2026-02-01'); assert.equal(p.to, '2026-02-28'); assert.equal(p.days, 28);
});
test('attendance is counted over the pay period, and loss of pay uses the days in that period', async () => {
  const { ctx, calls } = boot({ periodStartDay: 26 }, staff(), []); await ctx.loadStaffPayroll();
  ctx.__leave = 3;
  const r = ctx.computeStaffPayroll('a', '2026-11', {});
  assert.deepEqual(calls.att.at(-1).slice(1), ['2026-10-26', '2026-11-25']);
  assert.equal(r.lopDays, 2); assert.equal(r.lopDeduction, 2000); assert.equal(r.periodFrom, '2026-10-26'); assert.equal(r.periodTo, '2026-11-25');
});
test('a fixed 30-day basis divides the salary by 30 whatever the period length', async () => {
  const { ctx } = boot({ periodStartDay: 26, lopBasis: 'fixed', lopFixed: 30 }, staff(), []); await ctx.loadStaffPayroll();
  ctx.__leave = 3; assert.equal(ctx.computeStaffPayroll('a', '2026-11', {}).lopDeduction, 2066.67);
});
test('settings are cleaned: bad values fall back to safe ones', async () => {
  const { ctx } = boot({ periodStartDay: 40, payDay: 99, lopBasis: 'x', lopFixed: 5, defaultMode: 'Bitcoin' }, staff(), []); await ctx.loadStaffPayroll();
  assert.equal(ctx.payrollPeriod('2026-11').from, '2026-11-01'); assert.equal(ctx.daysInPayrollMonth('2026-11'), 30);
});
test('the Principal can be left off by designation; one person by flag; approved months stay visible', async () => {
  const recs = [approved('b', 50000)];
  const { ctx } = boot({ excludeDesignations: ['Principal'] }, staff(), recs); await ctx.loadStaffPayroll();
  vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-10'), ctx); assert.deepEqual(Array.from(ctx.payrollStaffList().map(s => s.id)), ['a', 'c', 'd', 'e']);
  vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-11'), ctx); assert.ok(ctx.payrollStaffList().some(s => s.id === 'b'), 'an approved month keeps the person visible');
  const { ctx: c2 } = boot({}, staff(), []); await c2.loadStaffPayroll(); c2.staffList[0].payrollExcluded = true;
  assert.ok(!c2.payrollStaffList('2026-11').some(s => s.id === 'a'));
});
test('taking someone off the payroll removes their unfinished draft but refuses when the month is approved', async () => {
  const recs = [{ id: 'pay_a', staffId: 'a', month: '2026-11', status: 'Draft' }, approved('d', 15000)];
  const { ctx, calls } = boot({}, staff(), recs); await ctx.loadStaffPayroll(); vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-11'), ctx);
  await ctx.payrollSetExcluded('a', true); assert.equal(ctx.staffList[0].payrollExcluded, true);
  assert.ok(!ctx.staffPayrollRecords.some(r => r.staffId === 'a')); assert.ok(calls.saved.includes('staff-records'));
  await ctx.payrollSetExcluded('d', true); assert.ok(!ctx.staffList[3].payrollExcluded);
});
test('each staff member is paid by their own mode, falling back to the school default; only approved payrolls are listed', async () => {
  const recs = [approved('a', 29000), approved('c', 20000), approved('d', 15000), approved('e', 18000)];
  const { ctx } = boot({ defaultMode: 'Cheque' }, staff(), recs); await ctx.loadStaffPayroll(); vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-11'), ctx);
  const d = ctx.salaryDisbursementData('2026-11'); const by = Object.fromEntries(d.rows.map(r => [r.staffId, r.mode]));
  assert.deepEqual(by, { a: 'Cheque', c: 'Cash', d: 'Cheque', e: 'Cheque' });
  assert.equal(d.total, 82000); assert.equal(d.notApproved.length, 1);
});
test('a bank-transfer salary without bank details is flagged; cheque and cash are not', async () => {
  const recs = [approved('a', 29000), approved('e', 18000), approved('c', 20000)];
  const { ctx } = boot({}, staff(), recs); await ctx.loadStaffPayroll(); vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-11'), ctx);
  const d = ctx.salaryDisbursementData('2026-11'); assert.deepEqual(Array.from(d.missingBank.map(r => r.staffId)), ['e']);
});
test('marking paid: a cheque needs a number, a bank transfer needs bank details, then it is recorded and locked from reopening', async () => {
  const recs = [approved('a', 29000), approved('d', 15000), approved('e', 18000)];
  const { ctx, calls } = boot({}, staff(), recs); await ctx.loadStaffPayroll(); vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-11'), ctx);
  await ctx.payrollMarkPaid('d'); assert.notEqual(recs[1].payStatus, 'Paid');
  await ctx.payrollMarkPaid('e'); assert.notEqual(recs[2].payStatus, 'Paid');
  recs[1].payRef = '004501'; await ctx.payrollMarkPaid('d'); assert.equal(recs[1].payStatus, 'Paid'); assert.equal(recs[1].paidBy, 'Admin Tester'); assert.match(recs[1].paidDate, /^\d{4}-\d{2}-\d{2}$/);
  await ctx.payrollMarkPaid('a'); assert.equal(recs[0].payStatus, 'Paid');
  calls.toasts.length = 0; await ctx.reopenPayroll('d', '2026-11'); assert.equal(recs[1].status, 'Approved'); assert.ok(calls.toasts.some(t => /paid/i.test(t)));
  await ctx.payrollUndoPaid('d'); assert.equal(recs[1].payStatus, ''); await ctx.reopenPayroll('d', '2026-11'); assert.equal(recs[1].status, 'Draft');
});
test('a paid salary cannot have its mode or reference changed behind the paid mark', async () => {
  const recs = [approved('d', 15000)]; recs[0].payRef = '1'; recs[0].payStatus = 'Paid'; recs[0].payMode = 'Cheque';
  const { ctx } = boot({}, staff(), recs); await ctx.loadStaffPayroll(); vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-11'), ctx);
  await ctx.payrollSetMode('d', 'Cash'); await ctx.payrollSetRef('d', '999'); assert.equal(recs[0].payMode, 'Cheque'); assert.equal(recs[0].payRef, '1');
});
test('cheque numbers fill in order, keeping the leading zeros, only for unpaid cheque salaries', async () => {
  const recs = [approved('a', 1), approved('d', 15000), approved('e', 18000)]; recs[0].payMode = 'Cheque'; recs[2].payMode = 'Cheque';
  const { ctx } = boot({}, staff(), recs); await ctx.loadStaffPayroll(); vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-11'), ctx);
  ctx.document.getElementById = id => id === 'pdChqStart' ? { value: '004501' } : null;
  await ctx.payrollFillCheques(); assert.deepEqual([recs[0].payRef, recs[1].payRef, recs[2].payRef], ['004501', '004502', '004503']);
});
test('the disbursement report is grouped by pay mode and carries cheque numbers and paid status', async () => {
  const recs = [approved('a', 29000), approved('c', 20000), approved('d', 15000)]; recs[2].payRef = '77';
  const { ctx, calls } = boot({}, staff(), recs); await ctx.loadStaffPayroll(); vm.runInContext('staffPayrollMonth = '+JSON.stringify('2026-11'), ctx);
  ctx.downloadSalaryDisbursementExcel(); const rows = calls.excel[0];
  assert.deepEqual(Array.from(rows.map(r => r['Pay Mode'])), ['Bank Transfer', 'Cheque', 'Cash']); assert.equal(rows[1]['Cheque No / Reference'], '77'); assert.ok('Status' in rows[0]);
});
test('wiring: staff form, saving, payslip, server and the page list', () => {
  const idx = rd('public/index.html'), m16 = rd('public/modules/16-staff-activity-directory-assignments.js'), srv = rd('server.js');
  assert.ok(idx.includes('id="stfPayMode"') && idx.includes('id="stfPayrollExcluded"') && idx.includes('modules/81-payroll-pro.js'));
  assert.ok(m16.includes("payMode: g('stfPayMode')") && m16.includes("document.getElementById('stfPayrollExcluded').checked"));
  assert.ok(m17.includes('payslipExtraMeta(st, monthStr, preview)'));
  assert.ok(srv.includes("'payroll-settings': ['staff']"));
  for (const f of ['17-staff-assignments-wizard-payroll.js', '18-payroll-payslip-salary.js', '65-staff-advances.js', '74-payroll-guide.js']) assert.ok(!rd('public/modules/' + f).includes('staffList.filter(staffIsActive)'), f);
});
done();
