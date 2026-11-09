// Parent privacy consent: safe defaults, rules and guards.   Run:  node tests/consent.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = rd('server.js'), ui = rd('public/modules/76-consent.js'), idx = rd('public/index.html');
const a = server.indexOf('const CONSENT_KEY'), b = server.indexOf('let _consentCache');
assert.ok(a > 0 && b > a);
const ctx = {}; vm.createContext(ctx); vm.runInContext(server.slice(a, b) + ';this.norm = consentNormalize; this.defs = consentDefaults;', ctx);
test('consent is OFF by default and nothing turns on by accident', () => {
  assert.equal(ctx.defs().enabled, false);
  assert.equal(ctx.norm({}).enabled, false);
  assert.equal(ctx.norm({ enabled: 'true' }).enabled, false);
  assert.equal(ctx.norm({ enabled: true }).enabled, true);
});
test('the first box is always required and optional boxes never are', () => {
  const n = ctx.norm({ purposes: [{ id: 'x', label: 'A', required: true }, { id: 'core', label: 'B', required: false }] });
  assert.ok(n.purposes.find(p => p.id === 'core').required);
  assert.ok(!n.purposes.find(p => p.id === 'x').required);
  const none = ctx.norm({ purposes: [] }); assert.ok(none.purposes.some(p => p.id === 'core' && p.required));
});
test('bad settings fall back to safe values', () => {
  const n = ctx.norm({ mode: 'bogus', maxSkips: 999, startDate: 'tomorrow' });
  assert.equal(n.mode, 'remind'); assert.equal(n.maxSkips, 10); assert.equal(n.startDate, '');
  assert.equal(ctx.norm({ maxSkips: 'x' }).maxSkips, 3);
});
test('the notice has English and Telugu text and the school placeholders', () => {
  const d = ctx.defs(); assert.ok(d.noticeEn.includes('{school}') && d.noticeEn.includes('{officer}'));
  assert.ok(/[ఀ-౿]/.test(d.noticeTe));
});
test('answers are only ever added (history table is never updated or deleted from)', () => {
  assert.ok(server.includes('CREATE TABLE IF NOT EXISTS consent_history'));
  assert.ok(!/UPDATE consent_history|DELETE FROM consent_history/i.test(server));
});
test('admin viewing as a parent can never record or skip consent', () => {
  for (const r of ["'/api/consent/answer'", "'/api/consent/skip'"]) { const i = server.indexOf(r); assert.ok(i > 0); assert.ok(server.slice(i, i + 400).includes('impersonatedBy')); }
  const me = server.indexOf("'/api/consent/me'"); assert.ok(server.slice(me, me + 700).includes('impersonatedBy'));
});
test('only Admin or Principal can change settings, mark paper forms or send reminders', () => {
  for (const r of ["put('/api/consent/settings'", "'/api/consent/paper'", "'/api/consent/remind'"]) { const i = server.indexOf(r); assert.ok(i > 0); assert.ok(server.slice(i, i + 350).includes('MATERIAL_MGR')); }
});
test('"must answer" mode refuses ask-me-later, and ask-me-later is limited', () => {
  const i = server.indexOf("'/api/consent/skip'"); const body = server.slice(i, i + 1400);
  assert.ok(body.includes("s.mode === 'required'") && body.includes('s.maxSkips'));
});
test('agreeing needs the required box; decline and withdraw tell the Admin', () => {
  const i = server.indexOf("'/api/consent/answer'"); const body = server.slice(i, i + 2600);
  assert.ok(body.includes('p.required && !given[p.id]') && body.includes('notifyUsersByRole'));
});
test('reminders go only to unanswered parents, at most once a day, and not to children without a login', () => {
  const i = server.indexOf("'/api/consent/remind'"); const body = server.slice(i, i + 1800);
  assert.ok(body.includes("['pending', 'outdated']") && body.includes('20 * 3600000') && body.includes('noLogin'));
});
test('a class teacher only sees their own class', () => {
  assert.ok(/classTeacherOf/.test(server.slice(server.indexOf('async function consentStatusRows'), server.indexOf('async function consentStatusRows') + 1200)));
});
test('screen: Agree-to-all, language switch, ask-later and the switch-on confirmation exist', () => {
  for (const t of ['Agree to all', 'తెలుగు', 'Ask me later', 'Switch ON', 'Remind parents who have not answered', 'paper form received']) assert.ok(ui.includes(t), t);
});
test('screen is loaded by index.html and listed in the Users & Access tabs', () => {
  assert.ok(idx.includes('modules/76-consent.js'));
  assert.ok(rd('public/modules/60-pro-nav.js').includes("['privacyconsent', 'Privacy & Consent']"));
});
done('consent');
