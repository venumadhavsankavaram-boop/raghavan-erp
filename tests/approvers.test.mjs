// Discount approver list for non-admin staff.   Run:  node tests/approvers.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = rd('server.js'), m08 = rd('public/modules/08-fees-ledger-refunds.js'), m08f = rd('public/modules/08f-concession-center.js');
test('server offers a names-only approver list to any signed-in user', () => {
  const i = server.indexOf("app.get('/api/approvers'"); assert.ok(i > 0);
  const body = server.slice(i, i + 700);
  assert.ok(body.includes('SELECT id, name, role FROM users') && !/username|password|totp/.test(body));
  assert.ok(body.includes('401'));
});
test('both discount forms fill the approver box from that list, not only from the Admin-only users list', () => {
  assert.ok(m08.includes('discApproverOptionsHtml()') && m08f.includes('discApproverOptionsHtml()'));
  assert.ok(!/users\.filter\(u => \(u\.role ?=== ?'Admin' \|\| u\.role ?=== ?'Principal'\)/.test(m08 + m08f.replace(/discApproverCandidates[\s\S]*?\n  }\n/, '')));
  assert.ok(m08.includes('refreshDiscApprovers()') && m08f.includes('refreshDiscApprovers()'));
});
done('approvers');
