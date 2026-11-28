// Scouts & Guides: unit rules, attendance, badges, and that the module is wired in.   Run:  node tests/scouts-guides.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done, plain } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const win = {}; const ctx = vm.createContext({ window: win, document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({}), head: { appendChild() {} } }, console });
vm.runInContext(rd('public/modules/90-scouts-guides.js'), ctx, { filename: '90-scouts-guides.js' });
const SG = win.SG;

console.log('Who may change a unit');
const unit = { id: 'u1', leaderStaffId: 'st1', members: [] };
test('Admin and Principal can change any unit', () => { assert.ok(SG.canEditUnit('Admin', '', unit)); assert.ok(SG.canEditUnit('Principal', '', unit)); });
test('a Teacher can change only the unit they lead', () => {
  assert.ok(SG.canEditUnit('Teacher', 'st1', unit));
  assert.ok(!SG.canEditUnit('Teacher', 'st2', unit));
  assert.ok(!SG.canEditUnit('Teacher', '', unit));
});
test('Parent, Student and Accountant roles can never change a unit', () => { ['Parent', 'Student', 'Accountant', 'Office Assistant'].forEach(r => assert.ok(!SG.canEditUnit(r, 'st1', unit))); });
test('a missing unit is never editable', () => assert.ok(!SG.canEditUnit('Admin', '', null)));

console.log('Members');
test('a student is in one unit only: adding moves them', () => {
  const d = SG.newData(); d.units.push({ id: 'a', members: ['s1', 's2'] }, { id: 'b', members: [] });
  SG.addMembers(d, 'b', ['s2', 's3']);
  assert.deepEqual(plain(d.units[0].members), ['s1']); assert.deepEqual(plain(d.units[1].members), ['s2', 's3']);
  assert.equal(SG.unitOfStudent(d, 's2').id, 'b');
});
test('adding the same student twice does not duplicate', () => {
  const d = SG.newData(); d.units.push({ id: 'a', members: [] });
  SG.addMembers(d, 'a', ['s1']); SG.addMembers(d, 'a', ['s1']);
  assert.deepEqual(plain(d.units[0].members), ['s1']);
});
test('removing a member', () => {
  const d = SG.newData(); d.units.push({ id: 'a', members: ['s1', 's2'] }); SG.removeMember(d, 'a', 's1');
  assert.deepEqual(plain(d.units[0].members), ['s2']);
});

console.log('Attendance and badges');
test('attendance counts and percentage', () => {
  const d = SG.newData();
  d.activities.push({ id: '1', unitId: 'a', date: '2026-08-01', present: ['s1', 's2'] }, { id: '2', unitId: 'a', date: '2026-08-08', present: ['s1'] }, { id: '3', unitId: 'b', date: '2026-08-08', present: ['s1'] });
  assert.deepEqual({ ...SG.attendanceOf(d, 'a', 's1') }, { present: 2, total: 2, pct: 100 });
  assert.deepEqual({ ...SG.attendanceOf(d, 'a', 's2') }, { present: 1, total: 2, pct: 50 });
  assert.deepEqual({ ...SG.attendanceOf(d, 'z', 's1') }, { present: 0, total: 0, pct: 0 });
});
test('activities list newest first', () => {
  const d = SG.newData(); d.activities.push({ unitId: 'a', date: '2026-01-01' }, { unitId: 'a', date: '2026-03-01' });
  assert.equal(SG.unitActivities(d, 'a')[0].date, '2026-03-01');
});
test('badges for a student come oldest first', () => {
  const d = SG.newData(); d.awards.push({ studentId: 's1', level: 'B', date: '2026-05-01' }, { studentId: 's1', level: 'A', date: '2026-02-01' }, { studentId: 's2', level: 'C', date: '2026-01-01' });
  assert.deepEqual(plain(SG.awardsOf(d, 's1').map(a => a.level)), ['A', 'B']);
});
test('bad saved data falls back to safe defaults', () => {
  const d = SG.normalise({ units: 'x', levels: [] });
  assert.deepEqual(plain(d.units), []); assert.ok(d.levels.length >= 5); assert.deepEqual(plain(SG.normalise(null).awards), []);
});

console.log('Wired into the ERP');
test('sidebar button, screen and script tag exist', () => {
  const h = rd('public/index.html'); assert.ok(h.includes('id="navScouts"')); assert.ok(h.includes('id="view-scouts"')); assert.ok(h.includes('modules/90-scouts-guides.js'));
});
test('Admin, Principal and Teacher can open it; Parent and Student cannot', () => {
  const c = rd('public/modules/01-sidebar-search-validation-auth.js'), s = rd('server.js');
  for (const src of [c, s]) {
    for (const r of ['Admin', 'Principal', 'Teacher']) assert.match(src, new RegExp(r + ": \\[[^\\]]*'scouts'"));
    for (const r of ['Student', 'Parent', 'Accountant']) assert.doesNotMatch(src, new RegExp(r + ": \\[[^\\]]*'scouts'"));
  }
});
test('saved data is guarded by the scouts permission on the server', () => assert.match(rd('server.js'), /'scouts-guides': \['scouts'\]/));
test('switchView and the permission list know the screen', () => {
  assert.match(rd('public/modules/03-view-switching.js'), /initScoutsView/); assert.match(rd('public/modules/02-roles-permissions.js'), /key:'scouts'/); assert.match(rd('public/modules/00-core-ui-shell.js'), /scouts:'facilities'/);
});
done('scouts-guides');
