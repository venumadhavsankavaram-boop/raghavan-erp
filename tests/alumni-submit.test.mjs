// Alumni "share your story": validation, throttle, honeypot, storage and wiring.   Run:  node tests/alumni-submit.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let passed = 0, failed = 0; const queue = [];
const test = (n, f) => queue.push([n, f]);
const done = async label => { for (const [n, f] of queue) { try { await f(); passed++; console.log('  ok   ' + n); } catch (e) { failed++; process.exitCode = 1; console.error('  FAIL ' + n + '\n       ' + e.message); } } console.log('\n' + label + ': ' + passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : '')); };
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const mod = fs.readFileSync(path.join(root, 'public/modules/20f-website-content.js'), 'utf8');
const block = src.slice(src.indexOf('// ---------- Alumni: share your story'), src.indexOf('// ---------- Voucher register tables'));
assert.ok(block.length > 500, 'alumni block found');
function make() {
  const routes = {}; const store = { list: [] };
  const sql = async (strings, ...vals) => { const q = strings.join('?'); if (/SELECT value/.test(q)) return store.list.length ? [{ value: JSON.stringify(store.list) }] : []; if (/INSERT INTO kv_store/.test(q)) { store.list = JSON.parse(vals[0]); return []; } return []; };
  const app = { post: (p, h) => (routes[p] = h) };
  vm.runInNewContext(block, { app, sql, Map, Date, Math, String, JSON, Array, console });
  const call = async (body, ip = '1.1.1.1') => { let out, code = 200; const res = { status(c) { code = c; return res; }, json(v) { out = v; } }; await routes['/api/alumni-submit']({ body, headers: { 'x-forwarded-for': ip }, socket: {} }, res); return { code, out }; };
  return { call, store };
}
const good = { name: 'Ravi Kumar', batch: '2012', now: 'Engineer', quote: 'Study hard', contact: '9999999999' };
test('a valid story is saved as pending with contact', async () => { const c = make(); const r = await c.call(good); assert.equal(r.code, 201); assert.equal(c.store.list.length, 1); assert.equal(c.store.list[0].contact, '9999999999'); });
test('name, batch and contact are required', async () => { const c = make(); for (const k of ['name', 'batch', 'contact']) assert.equal((await c.call({ ...good, [k]: ' ' }, 'x' + k)).code, 400); });
test('web links are refused', async () => { const c = make(); assert.equal((await c.call({ ...good, quote: 'see http://spam.com' })).code, 400); });
test('long text is cut to the limits', async () => { const c = make(); await c.call({ ...good, name: 'a'.repeat(500), quote: 'b'.repeat(2000) }); assert.equal(c.store.list[0].name.length, 80); assert.equal(c.store.list[0].quote.length, 400); });
test('the hidden honeypot field saves nothing', async () => { const c = make(); const r = await c.call({ ...good, website: 'bot' }); assert.equal(r.code, 201); assert.equal(c.store.list.length, 0); });
test('one address can send at most 3 an hour', async () => { const c = make(); let r; for (let i = 0; i < 5; i++) r = await c.call(good, '7.7.7.7'); assert.equal(r.code, 429); assert.equal(c.store.list.length, 3); });
test('wiring: public route, CORS, storage permission, ERP card and website form', () => {
  assert.match(src, /path: '\/api\/alumni-submit', methods: \['POST'\]/); assert.match(src, /'\/api\/alumni-submit': 'POST, OPTIONS'/); assert.match(src, /'alumni-submissions': \['websitegallery'\]/);
  assert.match(mod, /alumniApprove/); assert.match(mod, /alumniReject/); assert.match(mod, /alumni-submissions/);
});
await done('alumni-submit');
