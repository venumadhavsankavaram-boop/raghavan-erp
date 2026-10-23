// Fee reminders follow the fee schedule.  Needs the ERP running (BASE) against DB_*; run:  node tests/e2e/fee-reminders.e2e.mjs
// It temporarily replaces the fee schedule and puts everything back afterwards.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise'); const bcrypt = require('bcryptjs');
const BASE = process.env.BASE || 'http://localhost:4042';
const db = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'demo', password: process.env.DB_PASSWORD || 'demopw', database: process.env.DB_NAME || 'bk_src' });
const q = async (s, p) => (await db.query(s, p))[0];
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const pw = 'Test#1234';
await q("UPDATE users SET password = ? WHERE username IN ('demo.admin','demo.parent')", [await bcrypt.hash(pw, 10)]);
const loginC = async u => (await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) })).headers.get('set-cookie').split(';')[0];
const admin = await loginC('demo.admin'), parent = await loginC('demo.parent');
const get = (c, p) => fetch(BASE + p, { headers: { Cookie: c } }).then(async r => ({ status: r.status, body: await r.json() }));
const put = (c, p, b) => fetch(BASE + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: c }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, body: await r.json() }));
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const add = d => { const x = new Date(today + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const saved = await q("SELECT value FROM kv_store WHERE `key` = 'fee-schedule'"); const savedSettings = await q("SELECT value FROM kv_store WHERE `key` = 'fee-reminder-settings'");
const setSched = async s => q("INSERT INTO kv_store (`key`, value) VALUES ('fee-schedule', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [JSON.stringify(s)]);
const ay = (await q("SELECT value FROM kv_store WHERE `key` = 'current-academic-year'"))[0];
const AY = ay ? String(ay.value).replace(/"/g, '') : '2026-27';
const terms = (a, b) => ({ mode: 'terms', terms: [{ id: 't1', name: 'Term 1', due: a, share: 50 }, { id: 't2', name: 'Term 2', due: b, share: 50 }] });
await q("DELETE FROM notification_events WHERE kind LIKE 'fee_%'");
await put(admin, '/api/fee-reminders/settings', { enabled: true, leadDays: 3, repeatEveryDays: 7, repeatMax: 0 });

console.log('Fee reminders');
await t('only the Admin can see or change reminder settings', async () => {
  assert.equal((await get(parent, '/api/fee-reminders/settings')).status, 403);
  assert.equal((await put(parent, '/api/fee-reminders/settings', {})).status, 403);
  assert.equal((await get(parent, '/api/fee-reminders/preview')).status, 403);
});
await t('settings are kept inside safe limits', async () => {
  const r = await put(admin, '/api/fee-reminders/settings', { enabled: true, leadDays: 999, repeatEveryDays: 1, repeatMax: 99 });
  assert.deepEqual([r.body.settings.leadDays, r.body.settings.repeatEveryDays, r.body.settings.repeatMax], [30, 3, 12]);
  await put(admin, '/api/fee-reminders/settings', { enabled: true, leadDays: 3, repeatEveryDays: 7, repeatMax: 0 });
});
await t('a term due in 3 days is announced as "due soon"', async () => {
  await setSched({ [AY]: { fee: terms(add(-60), add(3)), bus: { mode: 'yearly', due: add(200) } } });
  const p = (await get(admin, '/api/fee-reminders/preview')).body;
  assert.ok(p.soon > 0, JSON.stringify(p)); assert.match(p.sample.find(s => s.kind === 'fee_soon').message, /Term 2/);
});
await t('a term that fell due 2 days ago gets ONE "overdue" notice; one 40 days ago gets none unless repeats are on', async () => {
  await setSched({ [AY]: { fee: terms(add(-2), add(100)), bus: { mode: 'yearly', due: add(200) } } });
  const p1 = (await get(admin, '/api/fee-reminders/preview')).body; assert.ok(p1.overdue > 0 && p1.soon === 0, JSON.stringify(p1));
  await setSched({ [AY]: { fee: terms(add(-40), add(100)), bus: { mode: 'yearly', due: add(200) } } });
  const p2 = (await get(admin, '/api/fee-reminders/preview')).body; assert.equal(p2.overdue + p2.soon + p2.repeat, 0, JSON.stringify(p2));
});
await t('the weekly repeat only appears when switched on, at the right week', async () => {
  await setSched({ [AY]: { fee: terms(add(-15), add(100)), bus: { mode: 'yearly', due: add(200) } } }); // 15 days -> week 2
  assert.equal((await get(admin, '/api/fee-reminders/preview')).body.repeat, 0);
  const on = (await get(admin, '/api/fee-reminders/preview?repeatMax=4')).body; assert.ok(on.repeat > 0, JSON.stringify(on));
  await setSched({ [AY]: { fee: terms(add(-15), add(100)), bus: { mode: 'yearly', due: add(200) } } });
  const off = (await get(admin, '/api/fee-reminders/preview?repeatMax=1')).body; assert.equal(off.repeat, 0); // week 2 is past the limit of 1
});
await t('switching reminders off stops them', async () => {
  await setSched({ [AY]: { fee: terms(add(-60), add(3)), bus: { mode: 'yearly', due: add(200) } } });
  await put(admin, '/api/fee-reminders/settings', { enabled: false });
  assert.equal((await get(admin, '/api/fee-reminders/preview')).body.enabled, false);
  await put(admin, '/api/fee-reminders/settings', { enabled: true });
});
await t('a student who has paid the term is not reminded', async () => {
  await setSched({ [AY]: { fee: terms(add(-60), add(3)), bus: { mode: 'yearly', due: add(200) } } });
  const before = (await get(admin, '/api/fee-reminders/preview')).body;
  const name = before.sample.find(s => s.kind === 'fee_soon').name;
  const [first, ...rest] = name.split(' ');
  const st = (await q('SELECT id, class_name FROM students WHERE first_name = ? AND last_name = ? LIMIT 1', [first, rest.join(' ')]))[0];
  const fee = Number((await q('SELECT fee FROM fee_structure WHERE class_name = ?', [st.class_name]))[0].fee);
  await q("INSERT INTO payments (id, receipt_no, student_id, student_name, category, mode, amount, discount, instalment, date, note, class_at_payment) VALUES ('rem_test_pay', 'REMTEST', ?, ?, 'fee', 'Cash', ?, 0, '', ?, 'test', ?)", [st.id, name, fee, today, st.class_name]);
  const after = (await get(admin, '/api/fee-reminders/preview?').body, (await get(admin, '/api/fee-reminders/preview')).body);
  await q("DELETE FROM payments WHERE id = 'rem_test_pay'");
  assert.ok(after.total < before.total || !after.sample.some(s => s.name === name && s.kind === 'fee_soon'), 'still reminded');
});
console.log(`\nfee reminders: ${pass} passed, ${fail} failed`);
await q("DELETE FROM payments WHERE id = 'rem_test_pay'");
if (saved.length) await q("UPDATE kv_store SET value = ? WHERE `key` = 'fee-schedule'", [typeof saved[0].value === 'string' ? saved[0].value : JSON.stringify(saved[0].value)]);
if (savedSettings.length) await q("UPDATE kv_store SET value = ? WHERE `key` = 'fee-reminder-settings'", [typeof savedSettings[0].value === 'string' ? savedSettings[0].value : JSON.stringify(savedSettings[0].value)]);
else await q("DELETE FROM kv_store WHERE `key` = 'fee-reminder-settings'");
await db.end(); process.exit(fail ? 1 : 0);
