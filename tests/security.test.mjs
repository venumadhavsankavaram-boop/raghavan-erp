// Security hardening checks.   Run:  node tests/security.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const m22 = fs.readFileSync(path.join(root, 'public/modules/22-facilities-rooms-library-transport-timetable.js'), 'utf8');

const a = server.indexOf('const COMMON_PASSWORDS'), b = server.indexOf('const LOGIN_MAX_ATTEMPTS');
const ctx = vm.createContext({}); vm.runInContext(server.slice(a, b) + '\nthis.pp = passwordProblem;', ctx);
const pp = (p, r) => ctx.pp(p, r);
test('Admin and Principal need 8+ characters, others 6+', () => {
  assert.ok(pp('Ab1!xyz', 'Admin')); assert.equal(pp('Ab1!xyz9', 'Admin'), '');
  assert.ok(pp('Ab1!xyz', 'Principal')); assert.equal(pp('Ab12x9', 'Parent'), ''); assert.ok(pp('Ab12x', 'Teacher'));
});
test('obvious passwords are refused', () => {
  for (const p of ['password', '12345678', 'admin123', 'aaaaaaaa', 'QWERTY123', '111111']) assert.ok(pp(p, 'Teacher'), p);
});
test('the server and the browser use the same list', () => {
  const list = s => (s.match(/\[((?:'[^']+',? ?)+)\]/g) || []).join('');
  const srv = server.slice(a, b).match(/new Set\(\[(.*?)\]\)/s)[1].replace(/\s/g, '');
  const cli = m22.match(/passwordProblemClient[\s\S]*?\[((?:'[^']+',?)+)\]\.includes/)[1].replace(/\s/g, '');
  assert.equal(srv, cli);
});
test('safety headers are set on every response', () => {
  for (const h of ["X-Content-Type-Options', 'nosniff'", "X-Frame-Options', 'SAMEORIGIN'", 'Referrer-Policy', "frame-ancestors 'self'", 'Strict-Transport-Security']) assert.ok(server.includes(h), h);
  assert.ok(server.includes("app.disable('x-powered-by')"));
});
test('sign-in lockout also counts per username, not only per IP', () => {
  assert.ok(server.includes('userBlockSeconds(username)') && server.includes('userFailure(username)'));
});
test('changing the password signs out the other sessions', () => {
  const i = server.indexOf("app.post('/api/account/password'"); const body = server.slice(i, i + 2200);
  assert.ok(body.includes('DELETE FROM sessions WHERE user_id') && body.includes('passwordProblem(next'));
});
test('vendor key is compared in constant time everywhere', () => {
  assert.ok(!server.includes('key !== process.env.VENDOR_API_KEY')); assert.ok(server.includes('crypto.timingSafeEqual(a, b)'));
});
test('public enquiry form is throttled', () => { assert.ok(server.includes('inquiryGlobal.n > 300') && server.includes('429')); });
test('generated passwords use the secure random source', () => { assert.ok(m22.includes('getRandomValues(rnd)') && !/chars\[Math\.floor\(Math\.random/.test(m22.slice(m22.indexOf('function generateLoginPassword')))); });
done('security');
