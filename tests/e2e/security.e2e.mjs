// Security hardening against a running server.  Run:  BASE=http://127.0.0.1:4042 node tests/e2e/security.e2e.mjs
// Uses demo.admin (password Test#1234); the password is changed and put back. Restart the server afterwards (lockout counters).
import assert from 'node:assert/strict';
const B = process.env.BASE || 'http://127.0.0.1:4042', U = 'demo.admin', P = 'Test#1234', J = { 'Content-Type': 'application/json' };
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const post = async (p, body, ck, extra = {}) => { const r = await fetch(B + p, { method: 'POST', headers: { ...J, ...(ck ? { cookie: ck } : {}), ...extra }, body: JSON.stringify(body) }); return { s: r.status, d: await r.json().catch(() => ({})), ck: (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; '), h: r.headers }; };
const login = (pw = P, user = U) => post('/api/login', { username: user, password: pw, audience: 'staff' });

const home = await fetch(B + '/');
assert.equal(home.headers.get('x-content-type-options'), 'nosniff'); assert.equal(home.headers.get('x-frame-options'), 'SAMEORIGIN');
assert.ok(/frame-ancestors 'self'/.test(home.headers.get('content-security-policy'))); assert.equal(home.headers.get('x-powered-by'), null); ok('safety headers present, x-powered-by hidden');
const https = await fetch(B + '/', { headers: { 'x-forwarded-proto': 'https' } }); assert.ok(https.headers.get('strict-transport-security')); assert.equal(home.headers.get('strict-transport-security'), null); ok('HSTS only over https');

const a = await login(); assert.equal(a.s, 200); const ck1 = a.ck;
assert.equal((await post('/api/account/password', { current: P, next: '1234' }, ck1)).s, 400); ok('a 4-character password is refused');
assert.equal((await post('/api/account/password', { current: P, next: 'admin123' }, ck1)).s, 400); ok('an obvious password is refused');
assert.equal((await post('/api/account/password', { current: P, next: 'Abcdef1' }, ck1)).s, 400); ok('7 characters is too short for Admin');
// a second session for the same user: (single-session rule means logging in again ends the first) — so test the other direction
const NEWPW = 'Sturdy#Pass9';
const ch = await post('/api/account/password', { current: P, next: NEWPW }, ck1); assert.equal(ch.s, 200); ok('a strong password is accepted');
assert.equal((await fetch(B + '/api/students', { headers: { cookie: ck1 } })).status, 200); ok('this device stays signed in after changing the password');
const b = await login(NEWPW); assert.equal(b.s, 200); assert.equal((await fetch(B + '/api/students', { headers: { cookie: ck1 } })).status, 401); ok('the old session is gone once someone signs in again');
const back = await post('/api/account/password', { current: NEWPW, next: P + 'x' }, b.ck); // restore below (Test#1234x is >=8)
await post('/api/account/password', { current: P + 'x', next: P }, b.ck); assert.equal((await login()).s, 200); ok('password restored for the next test run');

// lockout cannot be dodged by changing X-Forwarded-For
let last;
for (let i = 0; i < 27; i++) last = await post('/api/login', { username: 'demo.office', password: 'wrong' + i, audience: 'staff' }, null, { 'x-forwarded-for': '10.9.' + i + '.1' });
assert.equal(last.s, 429); ok('guessing one account is stopped even when every try pretends to come from a new address');
const real = await post('/api/login', { username: 'demo.office', password: P, audience: 'staff' }, null, { 'x-forwarded-for': '10.9.99.1' }); assert.equal(real.s, 429); ok('and the account stays paused for a few minutes');
assert.equal((await login()).s, 200); ok('other accounts are not affected');

// public enquiry throttle
let r, blocked = 0;
for (let i = 0; i < 20; i++) { r = await post('/api/admission-inquiries', { id: 'zz_throttle_' + Date.now() + i, parentName: 'T', parentEmail: 't@t.in', parentPhone: '9999999999', studentName: 'S', applyingGrade: '1', notes: 'test', submittedDate: '2026-10-23', status: 'New' }, null, { 'x-forwarded-for': '1.2.3.4' }); if (r.s === 429) blocked++; }
assert.ok(blocked >= 4); ok('the public enquiry form stops a flood (' + blocked + ' of 20 refused)');
console.log('\n' + n + ' checks passed. Restart the server before running again.');
