// After a page refresh the ERP returns to the page the person was on.   Run:  node tests/refresh-same-page.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'modules');
const auth = fs.readFileSync(path.join(root, '02-roles-permissions.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, '03-view-switching.js'), 'utf8');
let n = 0; const t = (name, f) => { try { f(); n++; console.log('  ok   ' + name); } catch (e) { process.exitCode = 1; console.error('  FAIL ' + name + '\n       ' + e.message); } };
t('switchView remembers the page for this user, after the permission check', () => {
  const i = sw.indexOf("rgv_last_view"); assert.ok(i > sw.indexOf("You do not have access to that section"), 'saved only for permitted pages');
  assert.match(sw, /uid: currentUser\.id, view: view/);
});
t('sign-in after refresh opens the remembered page, only for the same user, and falls back to home', () => {
  assert.match(auth, /last\.uid === u\.id/); assert.match(auth, /switchView\(startView\)/); assert.match(auth, /switchView\(allowed\[0\]\)/);
});
t('logging out forgets the remembered page', () => { assert.match(auth, /removeItem\('rgv_last_view'\)/); });
console.log('\nrefresh-same-page: ' + n + ' passed');
