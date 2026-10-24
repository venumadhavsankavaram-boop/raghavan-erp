// Tamper-proof attendance & marks against a running server.  Run:  BASE=http://127.0.0.1:4042 node tests/e2e/record-lock.e2e.mjs
// Uses demo.admin and demo.office (Test#1234). Restart the server afterwards (lockout counters).
import assert from 'node:assert/strict';
const B = process.env.BASE || 'http://127.0.0.1:4042', P = 'Test#1234', J = { 'Content-Type': 'application/json' };
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const call = async (m, p, body, ck) => { const r = await fetch(B + p, { method: m, headers: { ...J, ...(ck ? { cookie: ck } : {}), 'x-forwarded-for': '7.7.7.8' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { s: r.status, d, ck: (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; ') }; };
const login = u => call('POST', '/api/login', { username: u, password: P, audience: 'staff' });
const ad = await login('demo.admin'), off = await login('demo.office');
assert.equal(ad.s, 200); assert.equal(off.s, 200);
// give the Office Assistant role access to these modules for the duration of the test
const roleId = 'zz_lock_role_' + Date.now(), view = { view: true };
assert.equal((await call('POST', '/api/roles', { id: roleId, name: 'Office Assistant', permissions: { attendance: view, exams: view, result: view, staff: view } }, ad.ck)).s, 201);
const t = Date.now(), date = '2031-0' + (1 + t % 8) + '-1' + (t % 9);
const rec = (id, status) => ({ id, studentId: 'zz_lock_stu', date, session: 'Morning', status });
const srec = (id, status) => ({ id, staffId: 'zz_lock_stf', date, session: 'Morning', status });
const A = 'zz_lock_att_' + t, S = 'zz_lock_sta_' + t;

// student attendance
assert.ok([200,201].includes((await call('POST', '/api/attendance', rec(A, 'Present'), off.ck)).s)); ok('non-admin can mark an empty slot');
let r = await call('PUT', '/api/attendance', rec(A, 'Absent'), off.ck); assert.equal(r.s, 403); assert.equal(r.d.code, 'RECORD_LOCKED'); ok('non-admin cannot change a marked slot');
r = await call('POST', '/api/attendance', rec(A + 'b', 'Absent'), off.ck); assert.equal(r.s, 403); ok('re-posting the same student/date/session under a new id is refused too');
r = await call('DELETE', '/api/attendance?id=' + A, null, off.ck); assert.equal(r.s, 403); ok('non-admin cannot delete it');
r = await call('GET', '/api/attendance', null, ad.ck); assert.equal(r.d.find(x => x.id === A).status, 'Present'); ok('value is untouched');
assert.equal((await call('PUT', '/api/attendance', rec(A, 'Late'), ad.ck)).s, 200); ok('Admin can correct it');
r = await call('GET', '/api/audit-log?q=' + A + '&limit=10', null, ad.ck); assert.ok(r.d.rows.some(x => x.method === 'CORRECTION' && /Present -> Late/.test(x.detail))); ok('the correction is audited with before -> after');

// staff attendance
assert.ok([200,201].includes((await call('POST', '/api/staff-attendance', srec(S, 'Present'), off.ck)).s));
r = await call('PUT', '/api/staff-attendance', srec(S, 'Absent'), off.ck); assert.equal(r.s, 403); ok('staff attendance is locked for non-admin');
assert.equal((await call('PUT', '/api/staff-attendance', srec(S, 'Absent'), ad.ck)).s, 200); ok('Admin can correct staff attendance');

// marks: 24h correction window by default, then locked
const M = 'zz_lock_mk_' + t, mk = v => ({ id: M, examId: 'zz_exam', studentId: 'zz_lock_stu', subject: 'Maths', marks: v, absent: false });
r = await call('POST', '/api/exam-results', mk(40), off.ck); ok('office can enter a mark (status ' + r.s + ')');
if (r.s === 200 || r.s === 201) {
  assert.equal((await call('PUT', '/api/exam-results', mk(45), off.ck)).s, 200); ok('inside the correction window the entry can still be fixed');
  assert.equal((await call('PUT', '/api/kv/record-lock-policy', { marksGraceHours: 0 }, ad.ck)).s, 200);
  r = await call('PUT', '/api/exam-results', mk(50), off.ck); assert.equal(r.s, 403); ok('with the window set to 0 the mark is locked');
  assert.equal((await call('PUT', '/api/exam-results', mk(50), ad.ck)).s, 200); ok('Admin can still correct it');
  await call('PUT', '/api/kv/record-lock-policy', { marksGraceHours: 24 }, ad.ck);
}
// cleanup
await call('DELETE', '/api/roles?id=' + roleId, null, ad.ck);
for (const [p, id] of [['attendance', A], ['staff-attendance', S], ['exam-results', M]]) await call('DELETE', '/api/' + p + '?id=' + id, null, ad.ck);
console.log('\n' + n + ' checks passed. Restart the server before running again.');
