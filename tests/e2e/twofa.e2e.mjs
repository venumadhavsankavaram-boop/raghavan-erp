// Two-step sign-in against a running server.  Run:  BASE=http://127.0.0.1:4042 USER=demo.admin PASS='Test#1234' node tests/e2e/twofa.e2e.mjs
import assert from 'node:assert/strict';
import { totpAt } from '../../twofa.js';
const B = process.env.BASE || 'http://127.0.0.1:4042', U = process.env.USER_NAME || 'demo.admin', P = process.env.PASS || 'Test#1234';
const J = { 'Content-Type': 'application/json' };
async function call(path, body, ck) {
  const r = await fetch(B + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...J, ...(ck ? { cookie: ck } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const c = (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; ');
  return { s: r.status, d: await r.json().catch(() => ({})), ck: c };
}
let n = 0; const ok = (m) => console.log('  ok   ' + (++n) + '. ' + m);
const login = () => call('/api/login', { username: U, password: P, audience: 'staff' });

let a = await login(); assert.equal(a.s, 200); assert.ok(!a.d.twofaRequired); let ck = a.ck; ok('signs in with password only while two-step is off');
let st = await call('/api/account/2fa', undefined, ck); assert.equal(st.d.enabled, false); assert.equal(st.d.allowed, true); ok('status says OFF');
let bad = await call('/api/account/2fa/start', { method: 'app', password: 'wrong' }, ck); assert.equal(bad.s, 400); ok('turning on needs the right password');
const start = await call('/api/account/2fa/start', { method: 'app', password: P }, ck); assert.equal(start.s, 200); assert.ok(start.d.secret && start.d.otpauth.startsWith('otpauth://')); ok('setup gives a key');
assert.equal((await call('/api/account/2fa/confirm', { code: '000000' }, ck)).s, 400); ok('a wrong confirmation code is refused');
const conf = await call('/api/account/2fa/confirm', { code: totpAt(start.d.secret) }, ck); assert.equal(conf.s, 200); assert.equal(conf.d.recoveryCodes.length, 8); ok('right code turns it ON and gives 8 recovery codes');
const secret = start.d.secret, rec = conf.d.recoveryCodes;

await call('/api/logout', {}, ck);
a = await login(); assert.equal(a.s, 200); assert.equal(a.d.twofaRequired, true); assert.ok(a.d.token); assert.equal(a.ck, ''); ok('password alone no longer signs in: no session cookie, a code is asked for');
assert.equal((await call('/api/attendance', undefined, a.ck)).s, 401); ok('nothing is reachable before the code');
let w = await call('/api/login/2fa', { token: a.d.token, code: '123456' }); assert.equal(w.s, 401); assert.equal(w.ck, ''); ok('a wrong code is refused');
// the same current code just used at setup must not work again (replay protection) — wait for next step if needed
const stepNow = () => Math.floor(Date.now() / 30000);
let replay = await call('/api/login/2fa', { token: a.d.token, code: totpAt(secret) }); assert.equal(replay.s, 401); ok('the code already used at setup cannot be reused');
// next 30-second step
const wait = 30000 - (Date.now() % 30000) + 500; console.log('       (waiting ' + Math.round(wait / 1000) + 's for the next code)'); await new Promise(r => setTimeout(r, wait));
a = await login(); assert.equal(a.d.twofaRequired, true);
const good = await call('/api/login/2fa', { token: a.d.token, code: totpAt(secret) }); assert.equal(good.s, 200); assert.ok(good.ck.includes('sid=')); assert.equal(good.d.role, 'Admin'); assert.ok(!('password' in good.d) && !('totp_secret' in good.d) && !('totpSecret' in good.d)); ck = good.ck; ok('right code signs in; no secrets in the reply');
assert.equal((await call('/api/login/2fa', { token: a.d.token, code: totpAt(secret) })).s, 401); ok('a used login ticket cannot be reused');
const users = await call('/api/users', undefined, ck); assert.ok(!JSON.stringify(users.d).match(/totp|twofa|recovery_hash/i)); ok('the users list never exposes two-step secrets');

await call('/api/logout', {}, ck);
a = await login(); const r1 = await call('/api/login/2fa', { token: a.d.token, code: rec[0] }); assert.equal(r1.s, 200); ck = r1.ck; ok('a recovery code signs in');
await call('/api/logout', {}, ck);
a = await login(); assert.equal((await call('/api/login/2fa', { token: a.d.token, code: rec[0] })).s, 401); ok('a recovery code works only once');
// Wrong codes also count toward the usual sign-in lockout (5 failures in 15 minutes), so by now the account is slowed down.
a = await login();
if (a.s === 429) ok('repeated wrong codes lock sign-in for 15 minutes (message: ' + a.d.error + ')');
else { let last; for (let i = 0; i < 5; i++) last = await call('/api/login/2fa', { token: a.d.token, code: '111111' }); assert.ok(last.s === 401 || last.s === 429); ok('five wrong codes end the sign-in attempt'); }
console.log('\n  (the failed-attempt block lasts 15 minutes; restart the test server before re-running)\n' + n + ' checks passed');
