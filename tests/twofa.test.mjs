// Two-step sign-in building blocks.   Run:  node tests/twofa.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
import { base32Encode, base32Decode, totpAt, checkTotp, newTotpSecret, newRecoveryCodes, hashCode, maskEmail, looksLikeEmail, sendMail, smtpConfigured, otpauthUrl } from '../twofa.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

// RFC 6238 test secret is the ASCII text 12345678901234567890; at t=59s the 8-digit code is 94287082 (6-digit: 287082)
const rfcSecret = base32Encode(Buffer.from('12345678901234567890'));
test('base32 round trip', () => { const b = Buffer.from('hello world!!'); assert.equal(base32Decode(base32Encode(b)).toString(), 'hello world!!'); });
test('TOTP matches the RFC 6238 test vectors', () => {
  assert.equal(totpAt(rfcSecret, 59 * 1000), '287082');
  assert.equal(totpAt(rfcSecret, 1111111109 * 1000), '081804');
  assert.equal(totpAt(rfcSecret, 1234567890 * 1000), '005924');
});
test('a code from one step earlier or later is accepted, two steps away is not', () => {
  const t = 1700000000000, s = newTotpSecret();
  assert.notEqual(checkTotp(s, totpAt(s, t), t), null);
  assert.notEqual(checkTotp(s, totpAt(s, t - 30000), t), null);
  assert.notEqual(checkTotp(s, totpAt(s, t + 30000), t), null);
  assert.equal(checkTotp(s, totpAt(s, t - 90000), t), null);
});
test('checkTotp returns the step so a used code can be refused a second time', () => {
  const t = 1700000000000, s = newTotpSecret(); const c = totpAt(s, t);
  assert.equal(checkTotp(s, c, t), Math.floor(t / 30000));
});
test('bad input is rejected without throwing', () => {
  const s = newTotpSecret();
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined]) assert.equal(checkTotp(s, bad), null);
});
test('recovery codes: 8 unique, hashed comparison ignores case and dash', () => {
  const c = newRecoveryCodes(8); assert.equal(new Set(c).size, 8);
  assert.match(c[0], /^[0-9A-F]{5}-[0-9A-F]{5}$/);
  assert.equal(hashCode(c[0]), hashCode(c[0].toLowerCase().replace('-', '')));
  assert.notEqual(hashCode(c[0]), hashCode(c[1]));
});
test('email helpers', () => {
  assert.equal(maskEmail('principal@school.in'), 'pr*******@school.in'.replace('*******', '******'));
  assert.ok(looksLikeEmail('a@b.co')); assert.ok(!looksLikeEmail('nope')); assert.ok(!looksLikeEmail('a b@c.com'));
  assert.equal(smtpConfigured({}), false); assert.equal(smtpConfigured({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }), true);
});
test('authenticator link carries secret and school name', () => {
  const u = otpauthUrl('ABC234', 'admin', 'My School'); assert.ok(u.startsWith('otpauth://totp/My%20School:admin?secret=ABC234'));
});
test('server wiring: columns never exposed by the generic users API, routes public/guarded correctly', () => {
  assert.ok(/addColumnIfMissing\('users', 'totp_secret/.test(server));
  const f = server.slice(server.indexOf('SIMPLE_RESOURCES = {'), server.indexOf('  payments: {', server.indexOf('SIMPLE_RESOURCES = {')));
  assert.ok(!/totp|twofa/.test(f), 'secrets must not be in the users resource fields');
  assert.ok(server.includes("path: '/api/login/2fa'"));
  assert.ok(server.includes("if (TWOFA_ROLES.includes(user.role) && user.twofa_method)"));
  // the failed-attempt counter is not cleared when only the password was right
  const i = server.indexOf('if (TWOFA_ROLES.includes(user.role) && user.twofa_method)'), j = server.indexOf('recordLoginSuccess(rateKey);\n    return await completeLogin', i);
  assert.ok(j > i); assert.ok(!server.slice(i, j).includes('recordLoginSuccess'));
});

// A fake mail server (implicit TLS) to prove the built-in email sender speaks SMTP correctly.
let smtpOk = null;
try {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', dir + '/k.pem', '-out', dir + '/c.pem', '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const got = { cmds: [], data: '' };
  const srv = tls.createServer({ key: fs.readFileSync(dir + '/k.pem'), cert: fs.readFileSync(dir + '/c.pem') }, (s) => {
    let inData = false, buf = '';
    s.write('220 fake ready\r\n');
    s.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = inData ? buf.indexOf('\r\n.\r\n') : buf.indexOf('\r\n')) >= 0) {
        if (inData) { got.data = buf.slice(0, idx); buf = buf.slice(idx + 5); inData = false; s.write('250 queued\r\n'); continue; }
        const line = buf.slice(0, idx); buf = buf.slice(idx + 2); got.cmds.push(line);
        if (/^EHLO/.test(line)) s.write('250-fake\r\n250 AUTH LOGIN\r\n');
        else if (line === 'AUTH LOGIN') s.write('334 VXNlcm5hbWU6\r\n');
        else if (got.cmds.length === 3) s.write('334 UGFzc3dvcmQ6\r\n');
        else if (got.cmds.length === 4) s.write('235 ok\r\n');
        else if (/^MAIL|^RCPT/.test(line)) s.write('250 ok\r\n');
        else if (line === 'DATA') { inData = true; s.write('354 go\r\n'); }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
      }
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const env = { SMTP_HOST: '127.0.0.1', SMTP_PORT: '465', SMTP_USER: 'me', SMTP_PASS: 'pw', SMTP_FROM: 'School <noreply@school.in>' };
  // port 465 is implicit TLS in the sender; the fake listens on a random port, so force secure mode explicitly
  env.SMTP_PORT = String(srv.address().port); env.SMTP_SECURE = 'true';
  await sendMail({ to: 'a@b.co', subject: 'Your sign-in code', text: 'Code 123456\n.dot line' }, env);
  srv.close();
  smtpOk = got;
} catch (e) { smtpOk = e; }
test('email sender talks to a mail server end to end', () => {
  if (smtpOk instanceof Error) { if (/ENOENT/.test(smtpOk.message)) { console.log('       (openssl not found — skipped)'); return; } throw smtpOk; }
  assert.ok(smtpOk.cmds.includes('RCPT TO:<a@b.co>'));
  assert.ok(smtpOk.cmds.includes('MAIL FROM:<noreply@school.in>'));
  assert.ok(smtpOk.cmds.includes(Buffer.from('me').toString('base64')) && smtpOk.cmds.includes(Buffer.from('pw').toString('base64')));
  assert.ok(smtpOk.data.includes('Subject: Your sign-in code') && smtpOk.data.includes('Code 123456'));
  assert.ok(smtpOk.data.includes('..dot line'), 'a line starting with a dot is escaped');
});
done('two-step sign-in');
