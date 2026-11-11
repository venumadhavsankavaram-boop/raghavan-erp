// Salary accounting: optional consolidated payment vouchers grouped by account and payment mode, never posted twice.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'public/modules/85-payroll-accounting.js'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function boot({ staff, recs, settings = {}, posts = {}, vouchers = [] }) {
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {}, querySelector: () => null, insertAdjacentHTML() {} });
  const store = { 'payroll-accounting': { settings, posts } };
  let no = 0;
  const ctx = vm.createContext({
    console, Date, Math, Number, String, Array, Object, JSON, Promise, Set, setTimeout: () => 0, isFinite,
    OBJECT_BACKED_KEYS: {}, ACCT_EXPENSES_KEY: 'acctExpenses', ACCT_EXPENSE_CATS_KEY: 'acctExpenseCategories',
    staffList: staff, staffIsActive: () => true, payrollStaffList: () => staff,
    findPayrollRecord: (id, m) => recs.find(r => r.staffId === id && r.month === m),
    payrollPeriod: m => ({ from: m + '-01', to: m + '-30' }),
    acctExpenses: vouchers, acctExpenseCategories: ['Salaries'], acctCostCenters: ['Tuition Fee', 'Vehicle Fee (Transport)', 'General / Other'],
    currentUser: { role: 'Admin', name: 'Admin' },
    storageGet: async (k, d) => store[k] || d, storageSet: async (k, v) => { if (k === 'payroll-accounting') store[k] = JSON.parse(JSON.stringify(v)); return true; },
    issueDocNumber: async () => 'PV/' + String(++no).padStart(3, '0'), docDraftDone() {}, showToast() {}, showPromptDialog: async () => 'test',
    document: { getElementById: () => null, querySelector: () => null, createElement: el, head: { appendChild() {} }, body: { appendChild() {}, contains: () => false } },
  });
  ctx.window = ctx; vm.runInContext(src, ctx); ctx.__pa.setD({ settings, posts }); ctx.__store = store; return ctx;
}
const S = (id, des, dep) => ({ id, firstName: id, lastName: '', designation: des, department: dep || '' });
const R = (id, net, o) => ({ staffId: id, month: '2026-09', status: 'Approved', netSalary: net, payStatus: 'Paid', paidDate: '2026-09-30', payMode: 'Bank Transfer', epfEmployee: 0, epfEmployer: 0, esiEmployee: 0, esiEmployer: 0, ...o });
const staff = [S('t1', 'Teacher'), S('t2', 'Teacher'), S('d1', 'Driver')];
const on = (o) => ({ enabled: true, rules: [{ by: 'designation', value: 'Driver', costCenter: 'Vehicle Fee (Transport)' }], ...o });

test('switched off by default and nothing is posted', async () => {
  const c = boot({ staff, recs: [R('t1', 1000)] });
  assert.equal(c.__pa.D.settings.enabled, false);
  const r = await c.__pa.post('2026-09'); assert.equal(r.n, 0); assert.equal(c.acctExpenses.length, 0);
});
test('person rule beats designation, designation beats department, then the default account', () => {
  const c = boot({ staff, recs: [], settings: { enabled: true, rules: [
    { by: 'department', value: 'Transport', costCenter: 'General / Other' }, { by: 'designation', value: 'Driver', costCenter: 'Vehicle Fee (Transport)' }, { by: 'staff', value: 'd2', costCenter: 'Tuition Fee' }] } });
  assert.equal(c.__pa.ruleFor(S('d1', 'driver', 'Transport')).costCenter, 'Vehicle Fee (Transport)');
  assert.equal(c.__pa.ruleFor(S('d2', 'Driver', 'Transport')).costCenter, 'Tuition Fee');
  assert.equal(c.__pa.ruleFor(S('x', 'Clerk', 'Transport')).costCenter, 'General / Other');
  assert.equal(c.__pa.ruleFor(S('y', 'Teacher')).via, 'default');
});
test('drivers go to the vehicle account and teachers to tuition, one voucher each', async () => {
  const c = boot({ staff, recs: [R('t1', 1000), R('t2', 2000), R('d1', 500)], settings: on() });
  const r = await c.__pa.post('2026-09'); assert.equal(r.n, 2);
  const by = Object.fromEntries(c.acctExpenses.map(v => [v.costCenter, v]));
  assert.equal(by['Tuition Fee'].amount, 3000); assert.equal(by['Vehicle Fee (Transport)'].amount, 500);
  assert.equal(by['Tuition Fee'].category, 'Salaries');
});
test('cash and bank payments never share a voucher', async () => {
  const c = boot({ staff, recs: [R('t1', 1000), R('t2', 2000, { payMode: 'Cash' })], settings: on() });
  await c.__pa.post('2026-09'); assert.equal(c.acctExpenses.length, 2);
  assert.equal(JSON.stringify(c.acctExpenses.map(v => v.mode).sort()), JSON.stringify(['Bank Transfer', 'Cash']));
});
test('posting twice creates nothing new', async () => {
  const c = boot({ staff, recs: [R('t1', 1000), R('d1', 500)], settings: on() });
  await c.__pa.post('2026-09'); const n = c.acctExpenses.length; const r = await c.__pa.post('2026-09');
  assert.equal(r.n, 0); assert.equal(c.acctExpenses.length, n);
});
test('people not yet paid wait when the basis is "paid"; "approved" posts them', async () => {
  const recs = [R('t1', 1000), R('t2', 2000, { payStatus: 'Pending' })];
  const a = boot({ staff: staff.slice(0, 2), recs, settings: on() });
  assert.equal(a.__pa.scan('2026-09').notPaid.length, 1);
  const b = boot({ staff: staff.slice(0, 2), recs, settings: on({ basis: 'approved' }) });
  assert.equal(b.__pa.scan('2026-09').ready.length, 2);
});
test('unapproved staff are waiting and zero pay is skipped', () => {
  const c = boot({ staff, recs: [R('t1', 0), R('t2', 100, { status: 'Draft' })], settings: on() });
  const sc = c.__pa.scan('2026-09'); assert.equal(sc.zero, 1); assert.equal(sc.waiting.length, 2); assert.equal(sc.ready.length, 0);
});
test('EPF/ESI goes in its own voucher only when switched on', async () => {
  const recs = [R('t1', 1000, { epfEmployee: 120, epfEmployer: 130, esiEmployee: 10, esiEmployer: 20 })];
  const a = boot({ staff, recs, settings: on() }); await a.__pa.post('2026-09'); assert.equal(a.acctExpenses.length, 1);
  const b = boot({ staff, recs, settings: on({ statutory: true }) }); await b.__pa.post('2026-09');
  assert.equal(b.acctExpenses.length, 2); assert.equal(b.acctExpenses.find(v => /Statutory/.test(v.category)).amount, 280);
});
test('a voided voucher makes the salaries postable again; a changed net is reported', async () => {
  const recs = [R('t1', 1000)];
  const c = boot({ staff, recs, settings: on() }); await c.__pa.post('2026-09');
  recs[0].netSalary = 1200; const sc = c.__pa.scan('2026-09');
  assert.equal(sc.changed.length, 1); assert.equal(sc.changed[0].was, 1000); assert.equal(sc.changed[0].now, 1200);
  await c.__pa.voidEntry('2026-09', c.__pa.D.posts['2026-09'][0].id);
  assert.equal(c.acctExpenses[0].voided, true); assert.equal(c.__pa.scan('2026-09').ready.length, 1);
  await c.__pa.post('2026-09'); assert.equal(c.acctExpenses.filter(v => !v.voided)[0].amount, 1200);
});
test('a voucher voided directly in Accounting also frees the salaries', async () => {
  const c = boot({ staff, recs: [R('t1', 1000)], settings: on() }); await c.__pa.post('2026-09');
  c.acctExpenses[0].voided = true; assert.equal(c.__pa.scan('2026-09').ready.length, 1);
});
test('automatic mode posts only when the whole month is done', async () => {
  const recs = [R('t1', 1000), R('t2', 2000, { payStatus: 'Pending' })];
  const c = boot({ staff: staff.slice(0, 2), recs, settings: on({ trigger: 'auto' }) });
  await c.__pa.maybeAuto('2026-09'); assert.equal(c.acctExpenses.length, 0);
  recs[1].payStatus = 'Paid'; await c.__pa.maybeAuto('2026-09'); assert.equal(c.acctExpenses.length, 1);
  const m = boot({ staff, recs: [R('t1', 1000)], settings: on() });
  await m.__pa.maybeAuto('2026-09'); assert.equal(m.acctExpenses.length, 0);
});
test('one voucher per person when asked, one for the month when asked', async () => {
  const p = boot({ staff, recs: [R('t1', 1000), R('t2', 2000)], settings: on({ grouping: 'person' }) }); await p.__pa.post('2026-09'); assert.equal(p.acctExpenses.length, 2);
  const m = boot({ staff, recs: [R('t1', 1000), R('d1', 500)], settings: on({ grouping: 'month' }) }); await m.__pa.post('2026-09');
  assert.equal(m.acctExpenses.length, 1); assert.equal(m.acctExpenses[0].amount, 1500);
});
test('the voucher date follows the date rule', async () => {
  const c = boot({ staff, recs: [R('t1', 1000)], settings: on({ dateRule: 'month-end' }) }); await c.__pa.post('2026-09');
  assert.equal(c.acctExpenses[0].date, '2026-09-30');
});
test('wiring: loaded after the leave statement and the settings key is guarded for staff', () => {
  assert.ok(idx.indexOf('84-leave-statement.js') > 0 && idx.indexOf('85-payroll-accounting.js') > idx.indexOf('84-leave-statement.js'));
  assert.ok(/'payroll-accounting':\s*\['staff'\]/.test(srv));
});
done();
