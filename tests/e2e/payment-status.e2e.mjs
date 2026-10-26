// Admin "Online payments" status card against a fake Razorpay.
//   Start the ERP (NOT in demo mode) on PORT with: RAZORPAY_KEY_ID=rzp_test_abcd1234 RAZORPAY_KEY_SECRET=secret123 RAZORPAY_WEBHOOK_SECRET=whsec RAZORPAY_API_BASE=http://127.0.0.1:4999
//   then: BASE=http://localhost:PORT DB_*=... node tests/e2e/payment-status.e2e.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startFakeRazorpay } from './fake-razorpay.mjs';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise'); const bcrypt = require('bcryptjs');
const BASE = process.env.BASE || 'http://localhost:4043', FAKE = 4999;
const db = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'demo', password: process.env.DB_PASSWORD || 'demopw', database: process.env.DB_NAME || 'bk_src' });
const q = async (s, p) => (await db.query(s, p))[0];
const fake = await startFakeRazorpay(FAKE, 'rzp_test_abcd1234', 'secret123');
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const pw = 'Test#1234';
await q("UPDATE users SET password = ? WHERE username IN ('demo.parent','demo.admin')", [await bcrypt.hash(pw, 10)]);
const login = async u => { const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '6.6.6.6' }, body: JSON.stringify({ username: u, password: pw }) }); assert.equal(r.status, 200); return (r.headers.get('set-cookie') || '').split(';')[0]; };
const get = (ck, p, m = 'GET') => fetch(BASE + p, { method: m, headers: { Cookie: ck } }).then(async r => ({ s: r.status, b: await r.json().catch(() => ({})) }));
const admin = await login('demo.admin'), parent = await login('demo.parent');

let r = await get(parent, '/api/payments/health'); assert.equal(r.s, 403); ok('a parent cannot see the payment status');
r = await get(parent, '/api/payments/test-connection', 'POST'); assert.equal(r.s, 403); ok('a parent cannot run the connection test');
r = await get(admin, '/api/payments/health'); assert.equal(r.s, 200);
assert.equal(r.b.configured, true); assert.equal(r.b.mode, 'test'); assert.equal(r.b.webhookSecretSet, true); assert.equal(r.b.keyMasked, 'rzp_test_••••1234');
ok('Admin sees: configured, test mode, webhook on, masked key');
const text = JSON.stringify(r.b); assert.ok(!text.includes('secret123') && !text.includes('whsec') && !text.includes('abcd1234')); ok('no secret or full key id ever appears in the response');
assert.match(r.b.webhookUrl, /\/api\/payments\/webhook$/); ok('the webhook address is given');
// a payment started 20 minutes ago and never finished counts as stuck
await q("DELETE FROM online_payments WHERE order_id = 'order_status_probe'");
await q("INSERT INTO online_payments (order_id, student_id, amount, status, created_at) VALUES ('order_status_probe', (SELECT id FROM students LIMIT 1), 500, 'created', NOW() - INTERVAL 20 MINUTE)").catch(async () => { throw new Error('could not insert probe order; table columns changed?'); });
r = await get(admin, '/api/payments/health'); assert.ok(r.b.stats.stuck >= 1); ok('an unfinished payment older than 15 minutes is counted as stuck');
await q("DELETE FROM online_payments WHERE order_id = 'order_status_probe'");
// the school's own on/off switch for parents
r = await get(parent, '/api/payments/status'); assert.equal(r.b.enabled, true); ok('by default parents are offered online payment when keys are set');
r = await get(parent, '/api/payments/switch', 'POST'); assert.equal(r.s, 403); ok('a parent cannot change the switch');
const sw = (ck, enabled) => fetch(BASE + '/api/payments/switch', { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }).then(async x => ({ s: x.status, b: await x.json().catch(() => ({})) }));
r = await sw(admin, false); assert.equal(r.s, 200); ok('Admin switches online payment OFF');
r = await get(parent, '/api/payments/status'); assert.equal(r.b.enabled, false); ok('parents are no longer offered it');
r = await fetch(BASE + '/api/payments/create-order', { method: 'POST', headers: { Cookie: parent, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 100, type: 'fee', key: 'fee' }) }); assert.equal(r.status, 501); assert.match((await r.json()).error, /switched off/); ok('a new online order is refused while it is off');
r = await get(admin, '/api/payments/health'); assert.equal(r.b.switchOn, false); assert.equal(r.b.offered, false); ok('the status card shows it is OFF');
r = await sw(admin, true); assert.equal(r.s, 200); r = await get(parent, '/api/payments/status'); assert.equal(r.b.enabled, true); ok('Admin switches it back ON');
r = await get(admin, '/api/payments/test-connection', 'POST'); assert.equal(r.b.ok, true); ok('Test connection succeeds when Razorpay accepts the keys');
await new Promise(res => fake.close(res));
r = await get(admin, '/api/payments/test-connection', 'POST'); assert.equal(r.b.ok, false); assert.match(r.b.message, /Could not reach Razorpay/); ok('Test connection explains the problem when Razorpay cannot be reached');
console.log('\n' + n + ' checks passed.'); await db.end();
