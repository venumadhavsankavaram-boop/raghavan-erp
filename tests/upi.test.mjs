// UPI payment claims: charge rule, safe defaults and the guards that stop false "I have paid" claims.   Run:  node tests/upi.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = rd('server.js'), ui = rd('public/modules/79-upi-pay.js'), idx = rd('public/index.html');
const a = server.indexOf('const UPI_KEY'), b = server.indexOf('let _upiCache');
assert.ok(a > 0 && b > a);
const ctx = {}; vm.createContext(ctx); vm.runInContext(server.slice(a, b) + ';this.calc = upiCalcCharge; this.norm = upiNormalize; this.defs = upiDefaults;', ctx);
const block = server.slice(server.indexOf('UPI payment claims (parents'), server.indexOf('// ---------- Exam plans'));
test('UPI is OFF by default and only an explicit true turns it on', () => {
  assert.equal(ctx.defs().enabled, false); assert.equal(ctx.norm({}).enabled, false);
  assert.equal(ctx.norm({ enabled: 'true' }).enabled, false); assert.equal(ctx.norm({ enabled: true }).enabled, true);
});
test('charge: none, percent, flat, min and max', () => {
  assert.equal(ctx.calc(1000, { mode: 'none' }, '2026-11-01'), 0);
  assert.equal(ctx.calc(1000, { mode: 'percent', percent: 1 }, '2026-11-01'), 10);
  assert.equal(ctx.calc(100, { mode: 'percent', percent: 1, min: 5 }, '2026-11-01'), 5);
  assert.equal(ctx.calc(10000, { mode: 'percent', percent: 1, max: 50 }, '2026-11-01'), 50);
  assert.equal(ctx.calc(1000, { mode: 'flat', flat: 7.5 }, '2026-11-01'), 7.5);
  assert.equal(ctx.calc(0, { mode: 'flat', flat: 7.5 }, '2026-11-01'), 0);
  assert.equal(ctx.calc(333, { mode: 'percent', percent: 0.35 }, '2026-11-01'), 1.17);
});
test('charge starts only from its effective date', () => {
  const c = { mode: 'flat', flat: 10, effectiveFrom: '2026-12-01' };
  assert.equal(ctx.calc(500, c, '2026-11-30'), 0); assert.equal(ctx.calc(500, c, '2026-12-01'), 10);
});
test('bad charge settings are clamped to safe values', () => {
  const n = ctx.norm({ charge: { mode: 'bogus', percent: 999, flat: -5, effectiveFrom: 'soon' } });
  assert.equal(n.charge.mode, 'none'); assert.equal(n.charge.percent, 10); assert.equal(n.charge.flat, 0); assert.equal(n.charge.effectiveFrom, '');
});
test('only a real image can be stored as the QR', () => {
  assert.equal(ctx.norm({ qr: 'javascript:alert(1)' }).qr, '');
  assert.equal(ctx.norm({ qr: 'data:image/png;base64,AAAA' }).qr, 'data:image/png;base64,AAAA');
});
test('claims need a 12-digit UTR, a sane date and a unique UTR', () => {
  assert.ok(block.includes('/^\\d{12}$/')); assert.ok(block.includes("paidOn > today")); assert.ok(block.includes('utr_key')); assert.ok(block.includes('uq_upi_utr_key'));
  assert.ok(block.includes('payments WHERE ref = ${utr}'));
});
test('approval is locked, once only, needs a bank check and records the UTR on the receipt', () => {
  assert.ok(block.includes("withKeyLock('upiclaim:'")); assert.ok(block.includes("c.status !== 'submitted'")); assert.ok(block.includes('seenInBank'));
  assert.ok(block.includes("'UPI'")); assert.ok(block.includes('issueReceiptNumbers'));
});
test('an admin "viewing as" a parent cannot send or approve claims', () => {
  assert.ok(block.includes('!req.authUser.impersonatedBy')); assert.ok(/upiIsStaff = req => .*impersonatedBy/.test(block));
});
test('routes are registered before the SPA catch-all, and the page script is loaded', () => {
  assert.ok(server.indexOf("app.post('/api/upi/claims'") < server.indexOf('app.get(/.*/'));
  assert.ok(idx.includes('modules/79-upi-pay.js')); assert.ok(ui.includes('navUpiClaims'));
});
test('a parent can only claim for their own linked children, never fall back to another child', () => {
  assert.ok(block.includes('b.studentId ? kids.find(k => k.id === String(b.studentId)) : kids[0]'));
  assert.ok(block.includes("'That student is not linked to this login.'"));
});
test('the parent screen never trusts the client for the charge', () => {
  assert.ok(block.includes('upiCalcCharge(feeAmount, s.charge, paidOn)'));
});
done();
