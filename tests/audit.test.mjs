// Audit trail wiring checks.   Run:  node tests/audit.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const m22 = fs.readFileSync(path.join(root, 'public/modules/22-facilities-rooms-library-transport-timetable.js'), 'utf8');
test('the audit endpoint is Admin only', () => { assert.ok(/app\.get\('\/api\/audit-log'[\s\S]{0,400}Admin/.test(server)); });
test('sign-in, failed sign-in, sign-out, password change and backup are all recorded', () => {
  for (const k of ["'LOGIN'", "'LOGOUT'", "'PASSWORD_CHANGED'", "'BACKUP_DOWNLOAD'", "'TWOFA_FAILED'", 'auditFailedLogin']) assert.ok(server.includes(k), k);
});
test('the screen understands every kind of entry the server writes', () => {
  for (const k of ['LOGIN_FAILED', 'LOGIN_BLOCKED', 'LOGOUT', 'TWOFA_FAILED', 'PASSWORD_CHANGED', 'BACKUP_DOWNLOAD', 'AUDIT_EXPORT', 'SETTING']) assert.ok(new RegExp(k + ":\\[").test(m22), k);
});
test('the screen reads {rows, hasMore} and nothing still expects a bare list', () => {
  assert.ok(/d\.rows/.test(m22) && /hasMore/.test(m22));
});
test('spreadsheet download neutralises formula cells', () => {
  const a = server.indexOf('const csvCell'); const ctx = vm.createContext({});
  vm.runInContext(server.slice(a, server.indexOf('};', a) + 2) + '\nthis.c = csvCell;', ctx);
  assert.equal(ctx.c('=1+1'), "'=1+1"); assert.equal(ctx.c('a,b'), '"a,b"'); assert.equal(ctx.c('say "hi"'), '"say ""hi"""'); assert.equal(ctx.c(null), '');
});
done();
