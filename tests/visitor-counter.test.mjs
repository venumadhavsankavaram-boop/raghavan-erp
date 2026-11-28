// Website visitor counter: counts once, ignores bots and floods, hides small numbers.   Run:  node tests/visitor-counter.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let passed = 0, failed = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);
const done = async label => {
  for (const [name, fn] of queue) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; process.exitCode = 1; console.error('  FAIL ' + name + '\n       ' + e.message); } }
  console.log('\n' + label + ': ' + passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : ''));
};
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.js'), 'utf8');
const block = src.slice(src.indexOf('// ---------- Public website visitor counter'), src.indexOf('// ---------- Voucher register tables'));
assert.ok(block.length > 500, 'visitor counter block found');

function make(min) {
  const routes = {}, days = {};
  const sql = async (strings, ...vals) => {
    const q = strings.join('?');
    if (/INSERT INTO site_visits/.test(q)) { days[vals[0]] = (days[vals[0]] || 0) + 1; return []; }
    if (/SUM\(n\)/.test(q)) return [{ t: String(Object.values(days).reduce((a, b) => a + b, 0)) }];
    return [];
  };
  const app = { get: (p, h) => (routes['GET ' + p] = h), post: (p, h) => (routes['POST ' + p] = h) };
  vm.runInNewContext(block, { app, sql, process: { env: min == null ? {} : { VISIT_COUNT_MIN: String(min) } }, Map, Number, String, Math, Date, console });
  const call = async (key, ua = 'Mozilla/5.0', ip = '1.1.1.1') => {
    let out; const res = { set() {}, json: v => (out = v), status() { return res; } };
    await routes[key]({ headers: { 'user-agent': ua, 'x-forwarded-for': ip }, socket: {} }, res); return JSON.parse(JSON.stringify(out));
  };
  return { call, days };
}
test('small totals stay hidden (default threshold 500)', async () => {
  const c = make(); const r = await c.call('POST /api/site-visit'); assert.deepEqual(r, { show: false });
});
test('a visit is counted and the total shows once it reaches the threshold', async () => {
  const c = make(2); assert.deepEqual(await c.call('POST /api/site-visit', 'Mozilla/5.0', '2.2.2.2'), { show: false });
  assert.deepEqual(await c.call('POST /api/site-visit', 'Mozilla/5.0', '3.3.3.3'), { show: true, total: 2 });
  assert.deepEqual(await c.call('GET /api/site-visits'), { show: true, total: 2 });
});
test('bots and empty user agents are not counted', async () => {
  const c = make(0);
  for (const ua of ['Googlebot/2.1', 'curl/8.0', 'python-requests/2', 'HeadlessChrome', '']) await c.call('POST /api/site-visit', ua, '4.4.4.4');
  assert.equal(Object.keys(c.days).length, 0);
});
test('one address adds at most 3 visits an hour', async () => {
  const c = make(0); let r; for (let i = 0; i < 8; i++) r = await c.call('POST /api/site-visit', 'Mozilla/5.0', '5.5.5.5');
  assert.equal(r.total, 3);
});
test('route is public and allowed from the website only for the right methods', () => {
  assert.match(src, /path: '\/api\/site-visit', methods: \['POST'\]/); assert.match(src, /'\/api\/site-visits': 'GET, OPTIONS'/); assert.match(src, /CREATE TABLE IF NOT EXISTS site_visits/);
});
await done('visitor-counter');
