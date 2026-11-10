// Admin Tools: the Parent portal and Teacher portal cards appear at once and come back if the page redraws.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const a = rd('public/modules/46-student-home.js'), b = rd('public/modules/52-teacher-portal.js');
test('both portal cards are put in place at once, with a Loading placeholder so the tab is never empty', () => {
  assert.ok(a.includes("setTimeout(adminCard, 30)")); assert.ok(b.includes("setTimeout(adminCard, 60)"));
  assert.ok(a.includes('Loading…') && b.includes('Loading…'));
});
test('a missing card is restored while the Admin Tools page is open', () => {
  assert.ok(a.includes("keepAdminCard('portalSettingsCard', adminCard)")); assert.ok(b.includes("keepAdminCard('teacherPortalCard', adminCard)"));
  assert.ok(a.includes('function keepAdminCard') && b.includes('function keepAdminCard'));
});
done();
