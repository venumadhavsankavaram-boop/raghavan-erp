// Admin password reset, "view as", forced change and reset requests against a running server.
// Run:  BASE=http://127.0.0.1:4042 node tests/e2e/password-tools.e2e.mjs   (demo seed logins, password Demo@123). Restart the server afterwards.
import assert from 'node:assert/strict';
const B = process.env.BASE || 'http://127.0.0.1:4042', P = process.env.DEMO_PASSWORD || 'Demo@123', J = { 'Content-Type': 'application/json' };
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const call = async (m, p, body, ck, ip = '8.8.8.1') => { const r = await fetch(B + p, { method: m, headers: { ...J, ...(ck ? { cookie: ck } : {}), 'x-forwarded-for': ip }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { s: r.status, d, ck: (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; ') }; };
const login = (u, pw = P, aud = 'staff') => call('POST', '/api/login', { username: u, password: pw, audience: aud });
const ad = await login('demo.admin'), off = await login('demo.office'), tch = await login('demo.teacher');
assert.equal(ad.s, 200); assert.equal(off.s, 200); assert.equal(tch.s, 200);

// ---- reset password ----
let r = await call('POST', '/api/admin/users/reset-password', { userId: 'u_demo_parent' }, off.ck); assert.equal(r.s, 403); ok('a non-admin cannot reset a password');
r = await call('POST', '/api/admin/users/reset-password', { userId: 'u_demo_admin' }, ad.ck); assert.equal(r.s, 400); ok('the Admin cannot reset their own password here');
r = await call('POST', '/api/admin/users/reset-password', { userId: 'u_demo_parent', newPassword: 'password' }, ad.ck); assert.equal(r.s, 400); ok('an easy-to-guess temporary password is refused');
r = await call('POST', '/api/admin/users/reset-password', { userId: 'u_demo_parent' }, ad.ck); assert.equal(r.s, 200); const temp = r.d.tempPassword; assert.ok(temp && temp.length >= 8); ok('Admin resets a parent login and gets a temporary password');
assert.equal((await login('demo.parent', P, 'parent')).s, 401); ok('the old password stops working');
const pl = await login('demo.parent', temp, 'parent'); assert.equal(pl.s, 200); assert.equal(pl.d.mustChangePassword, true); ok('the temporary password signs in and flags a forced change');
r = await call('GET', '/api/students', null, pl.ck); assert.equal(r.s, 403); assert.equal(r.d.code, 'MUST_CHANGE_PASSWORD'); ok('nothing else works until the password is changed');
r = await call('GET', '/api/me', null, pl.ck); assert.equal(r.s, 200); assert.equal(r.d.mustChangePassword, true); ok('/api/me still answers so the app can show the change screen');
r = await call('POST', '/api/account/password', { current: temp, next: temp }, pl.ck); assert.equal(r.s, 400); ok('the new password must differ from the temporary one');
r = await call('POST', '/api/account/password', { current: temp, next: 'Fresh#Pass77' }, pl.ck); assert.equal(r.s, 200); ok('the user chooses their own password');
r = await call('GET', '/api/me', null, pl.ck); assert.equal(r.d.mustChangePassword, false); ok('the flag is cleared');
const pl2 = await login('demo.parent', 'Fresh#Pass77', 'parent'); assert.equal(pl2.s, 200); assert.equal(pl2.d.mustChangePassword, false); ok('the new password works normally');
r = await call('GET', '/api/audit-log?q=PASSWORD_RESET&limit=20', null, ad.ck); const row = r.d.rows.find(x => x.method === 'PASSWORD_RESET'); assert.ok(row); assert.ok(!JSON.stringify(row).includes(temp)); ok('the reset is audited and the password is not in the log');

// ---- view as ----
r = await call('POST', '/api/admin/users/impersonate', { userId: 'u_demo_teacher' }, off.ck); assert.equal(r.s, 403); ok('a non-admin cannot view as another user');
r = await call('POST', '/api/admin/users/impersonate', { userId: 'u_demo_admin' }, ad.ck); assert.equal(r.s, 400); ok('cannot "view as" yourself');
const va = await call('POST', '/api/admin/users/impersonate', { userId: 'u_demo_teacher' }, ad.ck); assert.equal(va.s, 200); assert.ok(va.ck.startsWith('sid=')); ok('Admin opens the teacher account');
r = await call('GET', '/api/me', null, va.ck); assert.equal(r.d.role, 'Teacher'); assert.equal(r.d.impersonating.byId, 'u_demo_admin'); ok('the session is the teacher with a "viewing as" marker');
r = await call('GET', '/api/me', null, tch.ck); assert.equal(r.s, 200); ok("the teacher's own session is not disturbed");
r = await call('POST', '/api/account/password', { current: P, next: 'Whatever#123' }, va.ck); assert.equal(r.s, 403); ok('passwords cannot be changed while viewing as someone');
r = await call('POST', '/api/admin/users/reset-password', { userId: 'u_demo_parent' }, va.ck); assert.equal(r.s, 403); ok('admin tools are not available while viewing as someone');
r = await call('GET', '/api/me', null, ad.ck); assert.equal(r.s, 401); ok("the Admin's own cookie was replaced by the marked session");
const back = await call('POST', '/api/account/stop-viewing-as', {}, va.ck); assert.equal(back.s, 200); assert.ok(back.ck.startsWith('sid='));
r = await call('GET', '/api/me', null, back.ck); assert.equal(r.d.role, 'Admin'); assert.ok(!r.d.impersonating); ok('Exit returns to the Admin account without signing in again');
r = await call('GET', '/api/audit-log?q=IMPERSONATE&limit=20', null, back.ck); assert.ok(r.d.rows.some(x => x.method === 'IMPERSONATE_START') && r.d.rows.some(x => x.method === 'IMPERSONATE_END')); ok('start and end are audited');
r = await call('POST', '/api/account/stop-viewing-as', {}, back.ck); assert.equal(r.s, 400); ok('Exit does nothing when not viewing as someone');
let ad2 = back;

// ---- reset requests ----
const ipx = '9.9.9.' + (Date.now() % 200);
r = await call('POST', '/api/password-reset-request', { username: 'nobody.here' }, null, ipx); assert.equal(r.s, 200); const g1 = r.d.message; ok('an unknown username gets the same friendly answer');
r = await call('POST', '/api/password-reset-request', { username: 'demo.student' }, null, ipx); assert.equal(r.s, 200); assert.equal(r.d.message, g1); ok('a real username gets the identical answer (nothing leaks)');
await call('POST', '/api/password-reset-request', { username: 'DEMO.STUDENT' }, null, ipx);
r = await call('GET', '/api/admin/users/reset-requests', null, ad2.ck); assert.equal(r.d.filter(x => x.username === 'demo.student').length, 1); assert.ok(!r.d.some(x => x.username === 'nobody.here')); ok('the Admin sees one pending request for the real user');
r = await call('GET', '/api/admin/users/reset-requests', null, off.ck); assert.equal(r.s, 403); ok('others cannot see the requests');
r = await call('POST', '/api/admin/users/reset-password', { userId: 'u_demo_student' }, ad2.ck); assert.equal(r.s, 200);
r = await call('GET', '/api/admin/users/reset-requests', null, ad2.ck); assert.ok(!r.d.some(x => x.username === 'demo.student')); ok('resetting the password clears the request');
const ipf = '5.5.5.' + (Date.now() % 200);
for (let i = 0; i < 6; i++) r = await call('POST', '/api/password-reset-request', { username: 'x' + i }, null, ipf);
assert.equal(r.s, 429); ok('flooding requests from one address is stopped');
console.log('\n' + n + ' checks passed. Restart the server before running again.');
