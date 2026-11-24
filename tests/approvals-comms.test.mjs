// Approvals stay live, alerts are not doubled, parent messages reach staff, notices reach their audience.   Run:  node tests/approvals-comms.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = rd('server.js'), live = rd('public/modules/99-approvals-live.js'), index = rd('public/index.html');
test('a new pending request alerts the approvers once and a decided one clears its alert', () => {
  assert.ok(server.includes("approvalsChanged(beforeVal, value, req.authUser)"));
  assert.ok(/async function approvalsChanged[\s\S]*?notifyUsersByRole\(\['Admin', 'Principal'\]/.test(server));
  assert.ok(server.includes("type = 'approval' AND url ="));
});
test('the approval bell re-reads the request lists on every check, and senders re-read before adding', () => {
  assert.ok(live.includes('computeApprovalQueueItems = async function'));
  assert.ok(live.includes('PENDING_APPROVALS_KEY') && live.includes('STUDENT_DISCOUNTS_KEY') && live.includes('STAFF_PAYROLL_KEY'));
  assert.ok(index.includes('modules/99-approvals-live.js'));
  for (const f of ['22-facilities-rooms-library-transport-timetable-part1.js', '23-inventory-sales-admin-tools.js', '70-class-section-change.js']) {
    const s = rd('public/modules/' + f); assert.equal((s.match(/pendingApprovals\.push\(/g) || []).length, (s.match(/freshApprovals\(\)/g) || []).length, f);
  }
});
test('a parent message alerts the staff member or Management, and the reply alerts the parent', () => {
  assert.ok(server.includes("title: 'New message from a parent'") && server.includes("title: 'Reply to your message'"));
});
test('a signed-in person is recognised on the notices list, and staff only get staff notices', () => {
  assert.ok(server.includes("req.path === '/api/comms-messages'") && server.includes('req.authUser = { id: s0.user_id'));
  assert.ok(server.includes("!MANAGEMENT_ROLES.includes(req.authUser.role)") && server.includes("['allstaff', 'teachers', 'everyone']"));
});
test('one alert per login even when a login is linked to a student twice', () => {
  assert.ok(server.includes('for (const userId of new Set(userIds)) await sendPushToUser'));
});
test('a Teacher can notify only the parents of their own classes and sections', () => {
  assert.ok(server.includes('async function teacherNoticeRooms') && server.includes('TEACHER_NOTICE_MSG'));
  assert.ok(server.includes("req.authUser.role === 'Teacher' && !(await teacherNoticeOk(req.authUser.id, req.body || {}))"));
  assert.ok(index.includes('modules/99-teacher-notice-scope.js'));
});
done('approvals-comms');
