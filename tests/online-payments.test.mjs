// Online payment safety rules are present in the server code.   Run:  node tests/online-payments.test.mjs
// (The full behaviour test against a pretend Razorpay is tests/e2e/online-payments.e2e.mjs.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'public', 'modules', '25-student-parent-portal-intro.js'), 'utf8');
const verify = server.slice(server.indexOf("app.post('/api/payments/verify'"), server.indexOf("app.post('/api/payments/webhook'"));

test('verify never reads the amount or student from the browser', () => {
  assert.ok(!/studentId|amount|category/.test(verify.split('const expected')[0].replace(/row\.amount|r\.row\.amount|Number\(r\.row\.amount\)/g, '')));
});
test('the browser only sends the three Razorpay fields to verify', () => {
  const body = client.slice(client.indexOf("'/api/payments/verify'"), client.indexOf("'/api/payments/verify'") + 400);
  assert.ok(body.includes('razorpay_signature') && !body.includes('studentId'));
});
test('Razorpay is asked to confirm the payment and the amount', () => {
  assert.ok(server.includes("'/v1/payments/' + encodeURIComponent(paymentId)"));
  assert.ok(server.includes('Math.round(Number(row.amount) * 100) !== Number(p.amount)'));
});
test('signature comparison is constant-time', () => assert.ok(server.includes('crypto.timingSafeEqual')));
test('recording is once per order (deterministic id + lock)', () => {
  assert.ok(server.includes("'pay_online_' + orderId") && server.includes("withKeyLock('onlinepay:' + orderId"));
});
test('payments get the school receipt number, not the Razorpay id', () => assert.ok(server.includes('issueReceiptNumbers({ prefix, count: 1')));
test('webhook is public but signature-checked', () => {
  assert.ok(server.includes("{ path: '/api/payments/webhook', methods: ['POST'] }"));
  assert.ok(server.includes("req.get('x-razorpay-signature')"));
});
test('a background check finds unconfirmed payments', () => assert.ok(server.includes('sweepOnlinePayments')));
done();
