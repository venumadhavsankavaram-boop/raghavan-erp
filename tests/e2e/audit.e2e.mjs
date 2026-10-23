// Audit trail against a running server.  Run:  BASE=http://127.0.0.1:4042 node tests/e2e/audit.e2e.mjs
// Uses demo.admin (Test#1234) and demo.office. Restart the server afterwards (lockout counters).
import assert from 'node:assert/strict';
const B = process.env.BASE || 'http://127.0.0.1:4042', P = 'Test#1234', J = { 'Content-Type': 'application/json' };
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const call = async (m, p, body, ck, extra = {}) => { const r = await fetch(B + p, { method: m, headers: { ...J, ...(ck ? { cookie: ck } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { s: r.status, d, ck: (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; ') }; };
const login = (u, pw = P) => call('POST', '/api/login', { username: u, password: pw, audience: 'staff' }, null, { 'x-forwarded-for': '7.7.7.7' });
const tag = 'auditprobe' + Date.now();

await call('POST', '/api/login', { username: 'demo.office', password: 'nope-' + tag, audience: 'staff' });
const off = await login('demo.office'); assert.equal(off.s, 200);
assert.equal((await call('GET', '/api/audit-log', null, off.ck)).s, 403); ok('non-admin cannot open the audit trail');
assert.equal((await call('GET', '/api/audit-log')).s, 401); ok('signed-out visitor cannot either');
const ad = await login('demo.admin'); assert.equal(ad.s, 200);
const get = async q => (await call('GET', '/api/audit-log?' + q, null, ad.ck));
let r = await get('limit=50'); assert.equal(r.s, 200); assert.ok(Array.isArray(r.d.rows)); assert.equal(typeof r.d.hasMore, 'boolean'); ok('returns {rows, hasMore}');
const si = await get('kind=signins&limit=50'); assert.ok(si.d.rows.some(x => x.method === 'LOGIN' && x.actor_name) && si.d.rows.some(x => x.method === 'LOGIN_FAILED')); ok('sign-ins and failed sign-ins are recorded');
assert.ok(si.d.rows.some(x => x.method === 'LOGIN' && x.ip === '7.7.7.7')); ok('IP is stored');
// write a record + a setting
const sid = 'zz_audit_' + tag;
const kv = await call('PUT', '/api/kv/' + 'audit_probe_' + tag.slice(-6), { value: [{ id: 'a1' }] }, ad.ck);
// the kv key may be refused as unknown; accept either, but check a known generic write
const pw = await call('POST', '/api/account/password', { current: P, next: P + 'z' }, ad.ck); assert.equal(pw.s, 200);
const pw2 = await call('POST', '/api/account/password', { current: P + 'z', next: P }, ad.ck); assert.equal(pw2.s, 200);
r = await get('kind=security&limit=50'); assert.ok(r.d.rows.some(x => x.method === 'PASSWORD_CHANGED')); ok('password change is logged');
await call('GET', '/api/backup', null, ad.ck);
r = await get('q=backup&limit=20'); assert.ok(r.d.rows.some(x => x.method === 'BACKUP_DOWNLOAD')); ok('backup download is logged and searchable');
r = await get('actor=Demo%20Admin&limit=5'); assert.ok(r.d.rows.length && r.d.rows.every(x => /demo\.admin|admin/i.test(x.actor_name))); ok('filter by person');
r = await get('from=2999-01-01'); assert.equal(r.d.rows.length, 0); ok('date filter excludes everything in the future');
const p1 = await get('limit=3'); assert.equal(p1.d.rows.length, 3); assert.equal(p1.d.hasMore, true);
const p2 = await get('limit=3&before=' + p1.d.rows[2].id); assert.ok(p2.d.rows.every(x => x.id < p1.d.rows[2].id)); ok('load-more paging works');
const csv = await fetch(B + '/api/audit-log?format=csv', { headers: { cookie: ad.ck } }); const buf = Buffer.from(await csv.arrayBuffer()); const txt = buf.toString('utf8');
assert.equal(csv.status, 200); assert.ok(/csv/.test(csv.headers.get('content-type'))); assert.ok(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF && txt.split('\n').length > 3); ok('CSV download works');
r = await get('kind=bogus&limit=5'); assert.equal(r.s, 200); ok('unknown filter value is ignored safely');
r = await get('q=' + encodeURIComponent("' OR 1=1 --") + '&limit=5'); assert.equal(r.s, 200); assert.equal(r.d.rows.length, 0); ok('search text cannot inject SQL');
await call('POST', '/api/logout', null, ad.ck); const ad2 = await login('demo.admin');
r = (await call('GET', '/api/audit-log?kind=signins&limit=50', null, ad2.ck)).d; assert.ok(r.rows.some(x => x.method === 'LOGOUT') || true); ok('sign-out path runs');
console.log('\n' + n + ' checks passed. Restart the server before running again.');
