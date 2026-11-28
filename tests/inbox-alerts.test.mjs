// Inbox alerts: a parent/student message reaches the right teacher (or management), and the family hears back.   Run:  node tests/inbox-alerts.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let passed = 0, failed = 0; const queue = [];
const test = (n, f) => queue.push([n, f]);
const done = async label => { for (const [n, f] of queue) { try { await f(); passed++; console.log('  ok   ' + n); } catch (e) { failed++; process.exitCode = 1; console.error('  FAIL ' + n + '\n       ' + e.message); } } console.log('\n' + label + ': ' + passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : '')); };
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.js'), 'utf8');
const block = src.slice(src.indexOf('// ---------- Inbox alerts:'), src.indexOf("app.post('/api/concerns'"));
assert.ok(block.length > 400, 'inbox alert block found');
function make(staffExtra) {
  const pushes = [], roleCalls = [];
  const sql = async () => (staffExtra === undefined ? [] : [{ extra: staffExtra }]);
  const ctx = { sql, MANAGEMENT_ROLES: ['Admin', 'Principal'], console, JSON, String,
    sendPushToUser: async (u, p) => pushes.push([u, p]), notifyUsersByRole: async (r, p) => roleCalls.push([r, p]) };
  vm.runInNewContext(block + ';this.notifyInboxRecipient = notifyInboxRecipient; this.inboxWho = inboxWho;', ctx);
  return { ctx, pushes, roleCalls };
}
const P = { title: 'New message from a parent', body: 'Ravi (10th-A): hello', tag: 'concern', url: '/?view=inbox' };
test('a message to a teacher alerts that teacher\'s login', async () => { const m = make({ linkedUserId: 'u_t1' }); await m.ctx.notifyInboxRecipient({ recipientType: 'class_teacher', recipientStaffId: 's1' }, P); assert.equal(m.pushes.length, 1); assert.equal(m.pushes[0][0], 'u_t1'); assert.equal(m.roleCalls.length, 0); });
test('works when the staff record stores extra as text', async () => { const m = make(JSON.stringify({ linkedUserId: 'u_t2' })); await m.ctx.notifyInboxRecipient({ recipientType: 'subject_teacher', recipientStaffId: 's2' }, P); assert.equal(m.pushes[0][0], 'u_t2'); });
test('a message to management alerts Admin and Principal', async () => { const m = make(); await m.ctx.notifyInboxRecipient({ recipientType: 'management' }, P); assert.deepEqual(Array.from(m.roleCalls[0][0]), ['Admin', 'Principal']); assert.equal(m.pushes.length, 0); });
test('a teacher with no linked login: the office is told instead of nobody', async () => { const m = make({}); await m.ctx.notifyInboxRecipient({ recipientType: 'class_teacher', recipientStaffId: 's3', recipientName: 'Sita Madam' }, P); assert.equal(m.pushes.length, 0); assert.match(m.roleCalls[0][1].title, /No login for Sita Madam/); });
test('a failure while alerting never throws', async () => { const m = make({ linkedUserId: 'u' }); m.ctx.sendPushToUser = async () => { throw new Error('boom'); }; await m.ctx.notifyInboxRecipient({ recipientType: 'class_teacher', recipientStaffId: 's1' }, P); });
test('the student name and class appear in the alert text', () => { const m = make(); assert.equal(m.ctx.inboxWho({ first_name: 'Ravi', last_name: 'Kumar', class_name: '10th', section: 'A' }), 'Ravi Kumar (10th-A)'); });
test('wiring: concerns and submissions alert on create; replies and reviews alert the family', () => {
  assert.match(src, /title: 'New message from a parent'/); assert.match(src, /title: 'New student submission'/);
  assert.match(src, /tag: 'concern-reply'/); assert.match(src, /tag: 'submission-review'/);
  assert.equal((src.match(/notifyInboxRecipient\(\{ recipientType: b\.recipientType/g) || []).length, 2);
});
await done('inbox-alerts');
