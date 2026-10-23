// End-to-end check of online payments against a fake Razorpay.
//   Start the ERP on PORT with:  RAZORPAY_KEY_ID=rzp_test_x RAZORPAY_KEY_SECRET=secret123 RAZORPAY_WEBHOOK_SECRET=whsec
//   RAZORPAY_API_BASE=http://127.0.0.1:4999   then:   BASE=http://localhost:PORT DB_*=...  node tests/e2e/online-payments.e2e.mjs
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startFakeRazorpay } from './fake-razorpay.mjs';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise'); const bcrypt = require('bcryptjs');
const BASE = process.env.BASE || 'http://localhost:4042', KEY = 'rzp_test_x', SECRET = 'secret123', WH = 'whsec', FAKE = 4999;
const db = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'demo', password: process.env.DB_PASSWORD || 'demopw', database: process.env.DB_NAME || 'bk_src' });
const q = async (s, p) => (await db.query(s, p))[0];
const fake = await startFakeRazorpay(FAKE, KEY, SECRET);
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

// --- setup ---
const pw = 'Test#1234';
await q("UPDATE users SET password = ? WHERE username IN ('demo.parent','demo.student','demo.admin')", [await bcrypt.hash(pw, 10)]);
const stuId = (await q("SELECT linked_student_id AS s FROM users WHERE username = 'demo.parent'"))[0].s;
const other = (await q("SELECT id FROM students WHERE id <> ? AND deleted_at IS NULL LIMIT 1", [stuId]))[0].id;
await q("DELETE FROM student_extra_fees WHERE id IN ('xf_e2e','xf_other')");
await q("INSERT INTO student_extra_fees (id, student_id, name, amount, paid, paid_amount) VALUES ('xf_e2e', ?, 'E2E Trip', 500, 0, 0), ('xf_other', ?, 'Other Trip', 500, 0, 0)", [stuId, other]);
async function login(u) {
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
  if (!r.ok) throw new Error('login ' + u + ' ' + r.status);
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const api = (cookie, path, body, method = 'POST') => fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const pay = (order_id, extra = {}) => fetch(`http://127.0.0.1:${FAKE}/__pay`, { method: 'POST', body: JSON.stringify({ order_id, ...extra }) }).then(r => r.json());
const sig = (o, p) => crypto.createHmac('sha256', SECRET).update(o + '|' + p).digest('hex');
const rowsFor = id => q('SELECT * FROM payments WHERE id = ?', ['pay_online_' + id]);
const parent = await login('demo.parent'), student = await login('demo.student'), admin = await login('demo.admin');

console.log('Opening orders');
await t('staff cannot open an online order', async () => { assert.equal((await api(admin, '/api/payments/create-order', { amount: 100, type: 'fee', key: 'fee' })).status, 403); });
await t("a fee of ANOTHER student cannot be paid", async () => { assert.equal((await api(parent, '/api/payments/create-order', { amount: 100, type: 'extra', key: 'xf_other' })).status, 400); });
await t('more than is due on an extra fee is refused', async () => { assert.equal((await api(parent, '/api/payments/create-order', { amount: 501, type: 'extra', key: 'xf_e2e' })).status, 400); });
await t('zero / negative / huge amounts are refused', async () => { for (const a of [0, -5, 99999999]) assert.equal((await api(parent, '/api/payments/create-order', { amount: a, type: 'fee', key: 'fee' })).status, 400); });

console.log('Paying');
let A;
await t('paying less than the order is NOT recorded as the full amount', async () => {
  A = (await api(parent, '/api/payments/create-order', { amount: 1000, type: 'fee', key: 'fee', label: 'Tuition' })).body;
  assert.ok(A.orderId);
  const p = await pay(A.orderId, { amount: 100 }); // only ₹1 actually paid
  const r = await api(parent, '/api/payments/verify', { razorpay_order_id: A.orderId, razorpay_payment_id: p.id, razorpay_signature: sig(A.orderId, p.id) });
  assert.equal(r.status, 400); assert.equal((await rowsFor(A.orderId)).length, 0);
});
let B, pB;
await t('a genuine payment is recorded once with the school receipt number', async () => {
  B = (await api(parent, '/api/payments/create-order', { amount: 1000, type: 'fee', key: 'fee', label: 'Tuition' })).body;
  pB = await pay(B.orderId);
  const r = await api(parent, '/api/payments/verify', { razorpay_order_id: B.orderId, razorpay_payment_id: pB.id, razorpay_signature: sig(B.orderId, pB.id) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.receiptNo, /^[A-Z0-9]{2,8}-\d{2}-\d{6}$/);
  const rows = await rowsFor(B.orderId);
  assert.equal(rows.length, 1); assert.equal(Number(rows[0].amount), 1000); assert.equal(rows[0].receipt_no, r.body.receiptNo); assert.equal(rows[0].mode, 'Online'); assert.equal(rows[0].student_id, stuId);
});
await t('confirming the same payment again changes nothing', async () => {
  const r = await api(parent, '/api/payments/verify', { razorpay_order_id: B.orderId, razorpay_payment_id: pB.id, razorpay_signature: sig(B.orderId, pB.id) });
  assert.equal(r.status, 200); assert.equal(r.body.already, true); assert.equal((await rowsFor(B.orderId)).length, 1);
});
await t('a wrong signature is refused', async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 50, type: 'fee', key: 'fee' })).body; const p = await pay(O.orderId);
  assert.equal((await api(parent, '/api/payments/verify', { razorpay_order_id: O.orderId, razorpay_payment_id: p.id, razorpay_signature: 'deadbeef' })).status, 400);
  assert.equal((await rowsFor(O.orderId)).length, 0);
});
await t("another login cannot confirm someone else's order", async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 60, type: 'fee', key: 'fee' })).body; const p = await pay(O.orderId);
  assert.equal((await api(student, '/api/payments/verify', { razorpay_order_id: O.orderId, razorpay_payment_id: p.id, razorpay_signature: sig(O.orderId, p.id) })).status, 403);
});
await t('five confirmations at the same instant still make ONE receipt', async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 70, type: 'fee', key: 'fee' })).body; const p = await pay(O.orderId);
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => api(parent, '/api/payments/verify', { razorpay_order_id: O.orderId, razorpay_payment_id: p.id, razorpay_signature: sig(O.orderId, p.id) })));
  assert.ok(rs.every(r => r.status === 200)); assert.equal(new Set(rs.map(r => r.body.receiptNo)).size, 1); assert.equal((await rowsFor(O.orderId)).length, 1);
});
await t('an extra fee balance is updated on the server', async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 500, type: 'extra', key: 'xf_e2e', label: 'E2E Trip' })).body; const p = await pay(O.orderId);
  const r = await api(parent, '/api/payments/verify', { razorpay_order_id: O.orderId, razorpay_payment_id: p.id, razorpay_signature: sig(O.orderId, p.id) });
  assert.equal(r.status, 200);
  const f = (await q("SELECT paid, paid_amount FROM student_extra_fees WHERE id = 'xf_e2e'"))[0]; assert.equal(Number(f.paid_amount), 500); assert.equal(Number(f.paid), 1);
  await api(parent, '/api/payments/verify', { razorpay_order_id: O.orderId, razorpay_payment_id: p.id, razorpay_signature: sig(O.orderId, p.id) });
  assert.equal(Number((await q("SELECT paid_amount FROM student_extra_fees WHERE id = 'xf_e2e'"))[0].paid_amount), 500);
});
await t('an "authorized" payment is captured, then recorded', async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 80, type: 'fee', key: 'fee' })).body; const p = await pay(O.orderId, { status: 'authorized' });
  assert.equal((await api(parent, '/api/payments/verify', { razorpay_order_id: O.orderId, razorpay_payment_id: p.id, razorpay_signature: sig(O.orderId, p.id) })).status, 200);
});
await t('a failed payment is not recorded', async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 90, type: 'fee', key: 'fee' })).body; const p = await pay(O.orderId, { status: 'failed' });
  assert.equal((await api(parent, '/api/payments/verify', { razorpay_order_id: O.orderId, razorpay_payment_id: p.id, razorpay_signature: sig(O.orderId, p.id) })).status, 402);
  assert.equal((await rowsFor(O.orderId)).length, 0);
});

console.log('Payments whose confirmation never reached us');
await t('the background check finds a paid order the browser never confirmed', async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 110, type: 'fee', key: 'fee' })).body; await pay(O.orderId);
  await q("UPDATE online_payments SET created_at = NOW() - INTERVAL 10 MINUTE WHERE order_id = ?", [O.orderId]);
  const r = await api(admin, '/api/payments/check-now', {}); assert.equal(r.status, 200); assert.ok(r.body.recovered >= 1, JSON.stringify(r.body));
  assert.equal((await rowsFor(O.orderId)).length, 1);
});
await t('an unpaid order is left alone by the background check', async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 120, type: 'fee', key: 'fee' })).body;
  await q("UPDATE online_payments SET created_at = NOW() - INTERVAL 10 MINUTE WHERE order_id = ?", [O.orderId]);
  await api(admin, '/api/payments/check-now', {}); assert.equal((await rowsFor(O.orderId)).length, 0);
});
await t('the webhook records a payment when its signature is right, and refuses a wrong one', async () => {
  const O = (await api(parent, '/api/payments/create-order', { amount: 130, type: 'fee', key: 'fee' })).body; const p = await pay(O.orderId);
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: p.id, order_id: O.orderId } } } });
  const post = s => fetch(BASE + '/api/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': s }, body: raw });
  assert.equal((await post('bad')).status, 400); assert.equal((await rowsFor(O.orderId)).length, 0);
  assert.equal((await post(crypto.createHmac('sha256', WH).update(raw).digest('hex'))).status, 200); assert.equal((await rowsFor(O.orderId)).length, 1);
});
await t('the office list shows paid and unfinished orders', async () => {
  const r = await api(admin, '/api/payments/online-orders', null, 'GET'); assert.equal(r.status, 200);
  assert.ok(r.body.orders.some(o => o.status === 'paid') && r.body.orders.some(o => o.status === 'created'));
  assert.equal((await api(parent, '/api/payments/online-orders', null, 'GET')).status, 403);
});
console.log(`\nonline payments: ${pass} passed, ${fail} failed`);
await q("DELETE FROM student_extra_fees WHERE id IN ('xf_e2e','xf_other')");
await db.end(); fake.close(); process.exit(fail ? 1 : 0);
