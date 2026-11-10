// Switch login (teacher who is also a parent): guards.   Run:  node tests/switch-login.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = rd('server.js'), ui = rd('public/modules/80-switch-login.js'), idx = rd('public/index.html');
const block = server.slice(server.indexOf('Second login on the same phone'), server.indexOf('// ---------- Exam plans'));
test('only Teacher and Parent/Student logins can be paired, never Admin or accounts with two-step sign-in', () => {
  assert.ok(block.includes("const SW_STAFF = ['Teacher']")); assert.ok(block.includes('swPairOk')); assert.ok(block.includes('other.twofa_method'));
});
test('adding a login needs its real password, with the same lockout as sign-in', () => {
  assert.ok(block.includes('bcrypt.compare')); assert.ok(block.includes('checkLoginRateLimit')); assert.ok(block.includes('recordLoginFailure'));
});
test('the parked login can only be used by the person who paired it (shared pair key)', () => {
  assert.ok(block.includes('pair_key')); assert.ok(block.includes('mine[0].pair_key !== s.pair_key')); assert.ok(server.includes("'pair_key VARCHAR(64)'"));
});
test('"viewing as" sessions cannot add or switch logins', () => {
  assert.equal((block.match(/req\.authUser\.impersonatedBy/g) || []).length >= 3, true);
});
test('signing out removes the parked login as well', () => {
  assert.ok(server.includes('await swDestroyAlt(req);\n    await destroySession(req, res);')); assert.ok(server.includes('sid_alt=; HttpOnly'));
});
test('routes sit before the SPA catch-all and the menu script is loaded', () => {
  assert.ok(server.indexOf("app.post('/api/account/switch'") < server.indexOf('app.get(/.*/')); assert.ok(idx.includes('modules/80-switch-login.js')); assert.ok(ui.includes('swMenuBtn'));
});
done();
