// Leave applications: a multi-day leave may start in the afternoon and/or end with the morning only.
// Run:  DB_HOST=127.0.0.1 DB_USER=... DB_PASSWORD=... DB_NAME=<empty test database> node tests/leave-halfday.test.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
if (!process.env.DB_NAME) { console.log('leave-halfday: DB_NAME not set - skipped'); process.exit(0); }
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.TEST_PORT || '4393', B = 'http://127.0.0.1:' + PORT, PW = 'Test1234!x';
const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const [pre] = await db.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'");
if (pre[0].n) { const [c] = await db.query('SELECT COUNT(*) AS n FROM students'); if (c[0].n) { console.error('REFUSING: database has students'); process.exit(2); } }
const srv = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT, TZ: 'UTC', TEST_MODE: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
process.on('exit', () => { try { srv.kill(); } catch (_) {} });
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.error('  FAIL ' + n + (x === undefined ? '' : '  -> ' + JSON.stringify(x).slice(0, 300))); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ipn = 10;
async function call(method, p, cookie, body) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), 'x-forwarded-for': '9.9.9.' + (ipn++ % 200) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { s: r.status, j, ck: (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; ') };
}
try {
  let up = false; for (let i = 0; i < 90 && !up; i++) { try { up = (await fetch(B + '/api/demo-info')).ok; } catch (_) { await sleep(1000); } }
  if (!up) throw new Error('server did not start:\n' + log.slice(-1500));
  for (let i = 0; i < 60; i++) { const [u] = await db.query("SELECT id FROM users WHERE id = 'u_admin'").catch(() => [[]]); if (u.length) break; await sleep(1000); }
  const hash = await bcrypt.hash(PW, 10);
  await db.query("UPDATE users SET password = ? WHERE id = 'u_admin'", [hash]);
  await db.query('INSERT INTO users (id, name, username, password, role, linked_student_id, recovery_code) VALUES (?,?,?,?,?,?,?)', ['u_t1', 'Test Teacher', 'tteacher', hash, 'Teacher', '', 'RCT1']);
  await db.query("INSERT INTO staff (id, first_name, last_name, extra) VALUES ('st_t1','Test','Teacher', ?)", [JSON.stringify({ linkedUserId: 'u_t1' })]);
  const A = await call('POST', '/api/login', null, { username: 'admin', password: PW, audience: 'staff' });
  const T = await call('POST', '/api/login', null, { username: 'tteacher', password: PW, audience: 'staff' });
  ok('admin and teacher sign in', A.s === 200 && T.s === 200, [A.s, T.s]);
  const att = async d => (await db.query('SELECT session, status FROM staff_attendance_records WHERE staff_id = ? AND date = ? ORDER BY session', ['st_t1', d]))[0];

  // The teachers' case: afternoon of day 1 + the whole of day 2 = 1.5 days
  let r = await call('POST', '/api/staff-leave-requests', T.ck, { fromDate: '2026-12-07', toDate: '2026-12-08', isHalfDay: false, firstPart: 'Afternoon', lastPart: null, reason: 'Hospital' });
  ok('afternoon-start range is accepted', r.s === 201, r);
  const id1 = r.j && r.j.id;
  let list = (await call('GET', '/api/staff-leave-requests', T.ck)).j || [];
  ok('request keeps firstPart/lastPart', list[0] && list[0].firstPart === 'Afternoon' && list[0].lastPart === null, list[0]);
  ok('admin approves', (await call('PUT', '/api/staff-leave-requests?id=' + id1, A.ck, { decision: 'Approve' })).s === 200);
  let d1 = await att('2026-12-07'), d2 = await att('2026-12-08');
  ok('day 1: only the Afternoon is Leave (morning stays unmarked)', d1.length === 1 && d1[0].session === 'Afternoon' && d1[0].status === 'Leave', d1);
  ok('day 2: whole day Leave', d2.length === 1 && d2[0].session === null && d2[0].status === 'Leave', d2);

  // Both ends partial, three dates: afternoon of D1, full D2, morning of D3
  r = await call('POST', '/api/staff-leave-requests', T.ck, { fromDate: '2026-12-14', toDate: '2026-12-16', isHalfDay: false, firstPart: 'Afternoon', lastPart: 'Morning', reason: 'Function' });
  ok('both ends partial accepted', r.s === 201, r);
  await call('PUT', '/api/staff-leave-requests?id=' + r.j.id, A.ck, { decision: 'Approve' });
  const e1 = await att('2026-12-14'), e2 = await att('2026-12-15'), e3 = await att('2026-12-16');
  ok('3-day: first=Afternoon, middle=whole, last=Morning', e1.length === 1 && e1[0].session === 'Afternoon' && e2.length === 1 && e2[0].session === null && e3.length === 1 && e3[0].session === 'Morning', [e1, e2, e3]);

  // Plain whole-day range and single-date part values are ignored safely
  r = await call('POST', '/api/staff-leave-requests', T.ck, { fromDate: '2026-12-21', toDate: '2026-12-22', isHalfDay: false, reason: 'Trip' });
  await call('PUT', '/api/staff-leave-requests?id=' + r.j.id, A.ck, { decision: 'Approve' });
  const f1 = await att('2026-12-21'), f2 = await att('2026-12-22');
  ok('old-style whole-day range unchanged', f1.length === 1 && f1[0].session === null && f2.length === 1 && f2[0].session === null, [f1, f2]);
  r = await call('POST', '/api/staff-leave-requests', T.ck, { fromDate: '2026-12-28', toDate: '2026-12-28', isHalfDay: false, firstPart: 'Afternoon', lastPart: 'Morning', reason: 'One day' });
  list = (await call('GET', '/api/staff-leave-requests', T.ck)).j || [];
  const one = list.find(x => x.id === r.j.id);
  ok('same-date request ignores part values', one && one.firstPart === null && one.lastPart === null, one);
  r = await call('POST', '/api/staff-leave-requests', T.ck, { fromDate: '2027-01-04', toDate: '2027-01-04', isHalfDay: true, session: 'Afternoon', reason: 'Half' });
  await call('PUT', '/api/staff-leave-requests?id=' + r.j.id, A.ck, { decision: 'Approve' });
  const g1 = await att('2027-01-04');
  ok('single half-day request still works', g1.length === 1 && g1[0].session === 'Afternoon', g1);
} catch (e) { fail++; console.error('ERROR', e.message); }
console.log(`\nleave-halfday: ${pass} passed${fail ? ', ' + fail + ' FAILED' : ''}`);
try { srv.kill(); } catch (_) {}
await db.end(); process.exit(fail ? 1 : 0);
