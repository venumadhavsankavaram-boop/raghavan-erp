// Receipt / voucher numbers shown on forms.   Run:  node tests/number-display.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = fs.readFileSync(path.join(root, 'public', 'modules', '20f-number-display.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('module is valid JavaScript', () => { new vm.Script(mod); });
test('module is loaded by index.html after the voucher register', () => {
  const a = html.indexOf('modules/20e-voucher-register.js'), b = html.indexOf('modules/20f-number-display.js');
  assert.ok(a > 0 && b > a);
});
test('every form has a banner: receipt, ledger, family, income, payment, journal, refund', () => {
  for (const k of ['pay', 'ledger', 'family', 'inc', 'exp', 'jv', 'refund']) assert.ok(mod.includes("key:'" + k + "'"), k);
});
test('journal numbers are only looked at (peek), never used up by the screen', () => {
  assert.ok(mod.includes('peek:true'));
  assert.ok(/req\.body\.peek === true && !src/.test(server));
});
test('a number that changes at Save is announced', () => {
  assert.ok(mod.includes('changed to'));
});
done();
