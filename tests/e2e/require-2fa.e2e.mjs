// "Require two-step sign-in" against a running DEMO server.  Run:  BASE=http://127.0.0.1:4042 node tests/e2e/require-2fa.e2e.mjs
// Uses demo.admin, demo.principal, demo.accountant (password Demo@123). Leaves the rule OFF and two-step reset for both.
import assert from 'node:assert/strict';
import { totpAt } from '../../twofa.js';
const B = process.env.BASE || 'http://127.0.0.1:4042', P = process.env.DEMO_PASSWORD || 'Demo@123', J = { 'Content-Type': 'application/json' };
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const call = async (path, body, ck, ip = '8.8.4.4') => {
  const r = await fetch(B + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...J, 'x-forwarded-for': ip, ...(ck ? { cookie: ck } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { s: r.status, d: await r.json().catch(() => ({})), ck: (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; ') };
};
const login = (u, ip) => call('/api/login', { username: u, password: P, audience: 'staff' }, undefined, ip);
const sleepToNextStep = () => new Promise(r => setTimeout(r, 30000 - (Date.now() % 30000) + 400));
async function enrol(ck) { const s = await call('/api/account/2fa/start', { method: 'app', password: P }, ck); const c = await call('/api/account/2fa/confirm', { code: totpAt(s.d.secret) }, ck); assert.equal(c.s, 200); return s.d.secret; }

const ad = await login('demo.admin'); assert.equal(ad.s, 200); const adCk = ad.ck;
let pol = await call('/api/account/2fa/policy', undefined, adCk); assert.equal(pol.s, 200); assert.equal(pol.d.required, false); ok('the rule starts OFF');
assert.equal((await call('/api/account/2fa/policy', { required: true }, adCk)).s, 400); ok('an Admin without their own two-step cannot switch it on (no self-lockout)');
const tc = await login('demo.accountant', '8.8.4.5'); assert.equal((await call('/api/account/2fa/policy', undefined, tc.ck)).s, 403); assert.equal((await call('/api/account/2fa/policy', { required: true }, tc.ck)).s, 403); ok('only an Admin can see or change the rule');
await enrol(adCk); ok('Admin turns on their own two-step');
const on = await call('/api/account/2fa/policy', { required: true }, adCk); assert.equal(on.s, 200); assert.equal(on.d.required, true); ok('Admin switches the rule ON');
const off1 = await call('/api/account/2fa/disable', { password: P, code: '000000' }, adCk); assert.equal(off1.s, 400); assert.match(off1.d.error, /requires/i); ok('while required, two-step cannot be turned off (and no recovery code is used up)');

const pr = await login('demo.principal', '8.8.4.6'); assert.equal(pr.s, 200); assert.equal(pr.d.mustSetup2fa, true); ok('Principal without two-step signs in but is told to set it up');
const me = await call('/api/me', undefined, pr.ck); assert.equal(me.s, 200); assert.equal(me.d.mustSetup2fa, true); ok('/api/me also says so');
const blocked = await call('/api/students', undefined, pr.ck); assert.equal(blocked.s, 403); assert.equal(blocked.d.code, 'MUST_SETUP_2FA'); ok('everything else is blocked until set up');
assert.equal((await call('/api/account/2fa', undefined, pr.ck)).s, 200); ok('the set-up screen itself still works');
await enrol(pr.ck); await new Promise(r => setTimeout(r, 200));
const free = await call('/api/students', undefined, pr.ck); assert.notEqual(free.s, 403); ok('after setting up, the Principal can use the app again');
const tc2 = await call('/api/students', undefined, tc.ck); assert.notEqual(tc2.s, 403); assert.ok(!(await call('/api/me', undefined, tc.ck)).d.mustSetup2fa); ok('an Accountant is not affected');

// clean up: rule OFF, reset both
assert.equal((await call('/api/account/2fa/policy', { required: false }, adCk)).s, 200); ok('Admin switches the rule OFF');
const ov = await call('/api/account/2fa/overview', undefined, adCk);
for (const u of ov.d.users) if (u.method) await call('/api/account/2fa/reset', { userId: u.id }, adCk);
const ad2 = await login('demo.admin', '8.8.4.7'); assert.equal(ad2.d.twofaRequired, undefined); ok('cleaned up: nobody is left with two-step on, rule is OFF');
console.log('ALL ' + n + ' CHECKS PASSED');
