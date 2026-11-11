// UPI: alerts for the office, clearer set-up warnings, parent text without a QR, and the JSON text-encoding fix in db.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const m = rd('public/modules/79-upi-pay.js'), db = rd('db.js');
test('the office gets a menu badge, a tab-title count and a message for new UPI payments', () => {
  assert.ok(m.includes("pollTimer = setInterval(poll, 45000)") && m.includes("'/api/upi/count'") && m.includes('A parent has sent a new UPI payment to verify.'));
  assert.ok(m.includes("className = 'up-bdg'") && m.includes('function titleCount'));
});
test('the background check never keeps a forgotten screen signed in', () => {
  assert.ok(m.includes("headers: { 'x-background': '1' }"));
  assert.ok(m.includes('if(!isStaff() || document.hidden) return;'));
});
test('set-up warnings: odd UPI handle, missing QR, charge type left on No charge', () => {
  assert.ok(m.includes('function checkHtml') && m.includes('/^[a-z]+$/.test(handle)') && m.includes('No QR image uploaded') && m.includes('so parents are <b>not</b> being charged'));
  assert.ok(m.includes('Charge type is "No charge", so parents will NOT be charged'));
});
test('the parent card does not mention a QR when none is uploaded', () => {
  assert.ok(m.includes("pset.qr ? tx('Scan the school QR with any UPI app'") && m.includes(": tx('Pay to the school UPI ID with any UPI app'"));
});
test('JSON columns are decoded as UTF-8 bytes, so the rupee sign and Telugu text are not garbled', () => {
  const i = db.indexOf('function typeCast'); const f = db.slice(i, i + 600);
  assert.ok(f.includes('field.buffer()') && f.includes("toString('utf8')") && !f.includes('field.string()'));
});
done();
